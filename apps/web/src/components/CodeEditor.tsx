import { indentWithTab } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { python } from "@codemirror/lang-python";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import type { Language } from "@uat/shared";
import { basicSetup, EditorView } from "codemirror";
import { useEffect, useRef } from "react";

const LANGUAGE_SUPPORT: Record<Language, () => Extension> = {
  python,
  cpp,
  go,
};

type CodeEditorProps = {
  language: Language;
  value: string;
  onChange: (value: string) => void;
};

/**
 * CodeMirror 6 in a React component. CodeMirror owns its own DOM and state, so
 * React only creates it once and then pushes prop changes into it.
 * Colours come from the `.cm-*` and `.tok-*` rules in index.css.
 */
export function CodeEditor({ language, value, onChange }: CodeEditorProps) {
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
          keymap.of([indentWithTab]),
          indentUnit.of("    "),
          // Tag tokens with `tok-*` classes instead of inline colours.
          syntaxHighlighting(classHighlighter),
          languageSlot.current.of(LANGUAGE_SUPPORT[language]()),
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

  return <div ref={hostRef} className="absolute inset-0" />;
}
