import type { Language } from "@uat/shared";

export const LANGUAGE_NAMES: Record<Language, string> = {
  python: "Python",
  cpp: "C++",
  go: "Go",
};

/**
 * What the editor shows before the player has typed anything. Each one ends by
 * printing a placeholder answer, to show how output is expected: written to
 * standard output, followed by a newline. The value and its type are only an
 * example; each level's Output box says what to print.
 */
export const STARTER_CODE: Record<Language, string> = {
  python: `import sys


def main() -> None:
    data = sys.stdin.read().split()
    # What does the machine do with its input?
    ans = 0
    print(ans)


main()
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // What does the machine do with its input?
    int ans = 0;
    cout << ans << '\\n';
    return 0;
}
`,
  go: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	reader := bufio.NewReader(os.Stdin)
	_ = reader
	// What does the machine do with its input?
	ans := 0
	fmt.Println(ans)
}
`,
};
