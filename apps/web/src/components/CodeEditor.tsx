import { indentLess, indentMore } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { python } from "@codemirror/lang-python";
import { getIndentUnit, indentUnit, syntaxHighlighting } from "@codemirror/language";
import {
  Compartment,
  countColumn,
  EditorSelection,
  EditorState,
  type Extension,
  type StateCommand,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, type DecorationSet, keymap } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import type { Language } from "@uat/shared";
import { basicSetup, EditorView } from "codemirror";
import { useEffect, useRef } from "react";

const LANGUAGE_SUPPORT: Record<Language, () => Extension> = {
  python,
  cpp,
  go,
  java,
};

/**
 * The line a runtime error points at, shaded Oxblood (`.cm-errorLine` in
 * index.css). It lives in the editor's own state, so the editor drops it the
 * moment the text changes: the line number would no longer be right.
 */
const setErrorLine = StateEffect.define<number | null>();
const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(lines, transaction) {
    if (transaction.docChanged) return Decoration.none;
    for (const effect of transaction.effects) {
      if (!effect.is(setErrorLine)) continue;
      const number = effect.value;
      // Ignore a line the code does not have (the error came from older code).
      if (number === null || number > transaction.state.doc.lines) return Decoration.none;
      const line = transaction.state.doc.line(number);
      return Decoration.set([Decoration.line({ class: "cm-errorLine" }).range(line.from)]);
    }
    return lines;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Tab as VS Code has it. With nothing selected, it inserts spaces at the
 * cursor up to the next indent stop (a multiple of 4 columns), wherever the
 * cursor is on the line; with a selection, the selected lines move in a level.
 * Shift-Tab moves lines out a level either way. CodeMirror's own
 * `indentWithTab` always indents the whole line, so Tab mid-line moved the
 * line instead of the cursor, and 2 spaces plus Tab made 6.
 */
const tabLikeVSCode: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.some((range) => !range.empty)) return indentMore({ state, dispatch });
  const unit = getIndentUnit(state);
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.head);
    const column = countColumn(line.text.slice(0, range.head - line.from), state.tabSize);
    const spaces = " ".repeat(unit - (column % unit));
    return {
      changes: { from: range.head, insert: spaces },
      range: EditorSelection.cursor(range.head + spaces.length),
    };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

type CodeEditorProps = {
  language: Language;
  value: string;
  onChange: (value: string) => void;
  /** Shows the code without letting it be changed (fixed when the editor is created). */
  readOnly?: boolean;
  /**
   * A line to mark and scroll to (counting from 1), or null for none. An
   * object, so asking for the same line again (a new object) scrolls back to it.
   */
  errorLine?: { line: number } | null;
};

/**
 * CodeMirror 6 in a React component. CodeMirror owns its own DOM and state, so
 * React only creates it once and then pushes prop changes into it.
 * Colours come from the `.cm-*` and `.tok-*` rules in index.css.
 */
export function CodeEditor({ language, value, onChange, readOnly = false, errorLine = null }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // A compartment is a slot in the config that can be swapped while running.
  const languageSlot = useRef(new Compartment());

  // The listener below is created once; this keeps it calling the latest onChange.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create the editor once.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([{ key: "Tab", run: tabLikeVSCode, shift: indentLess }]),
          indentUnit.of("    "),
          // Tag tokens with `tok-*` classes instead of inline colours.
          syntaxHighlighting(classHighlighter),
          languageSlot.current.of(LANGUAGE_SUPPORT[language]()),
          errorLineField,
          // Read-only: no edits, and no cursor (contenteditable off), though
          // the text can still be selected and copied.
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The two effects below keep `language` and `value` in step afterwards.
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageSlot.current.reconfigure(LANGUAGE_SUPPORT[language]()),
    });
  }, [language]);

  // Replace the text only when the parent's value is not what the editor
  // already holds (switching language), never on the player's own typing.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // Mark the error's line and scroll just far enough to bring it into view.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const line = errorLine?.line ?? null;
    const inRange = line !== null && line <= view.state.doc.lines;
    view.dispatch({
      effects: [
        setErrorLine.of(line),
        ...(inRange ? [EditorView.scrollIntoView(view.state.doc.line(line).from, { y: "nearest" })] : []),
      ],
    });
  }, [errorLine]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
