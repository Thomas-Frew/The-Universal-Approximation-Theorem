import type { Language } from "@uat/shared";

export const LANGUAGE_NAMES: Record<Language, string> = {
  python: "Python",
  cpp: "C++",
  go: "Go",
};

/** What the editor shows before the player has typed anything. */
export const STARTER_CODE: Record<Language, string> = {
  python: `import sys


def main() -> None:
    data = sys.stdin.read().split()
    # What does the machine do with its input?
    print()


main()
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // What does the machine do with its input?
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
	fmt.Println()
}
`,
};
