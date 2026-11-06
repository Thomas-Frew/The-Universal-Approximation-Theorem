import type { Language } from "@uat/shared";

export const LANGUAGE_NAMES: Record<Language, string> = {
  python: "Python",
  cpp: "C++",
  go: "Go",
  java: "Java",
};

/**
 * What the editor shows on the first machine before the player has typed
 * anything (`starterCodeFor`); later machines start from a bare `main`
 * (SKELETON below), since by then the player has their own way of reading
 * input. Each one ends by printing a placeholder answer, to show how output is
 * expected: written to standard output, followed by a newline. The value and
 * its type are only an example; each level's Output box says what to print.
 */
export const STARTER_CODE: Record<Language, string> = {
  python: `import sys


def main() -> None:
    data = sys.stdin.read().split()
    ans = 0

    # What does the machine do with its input?
    print(ans)


main()
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    int ans = 0;

    // What does the machine do with its input?
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
	ans := 0

	// What does the machine do with its input?
	fmt.Println(ans)
}
`,
  java: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int ans = 0;

        // What does the machine do with its input?
        System.out.println(ans);
    }
}
`,
};

/**
 * Later machines start from the bare structure: `main`, and what the
 * language needs around it to compile (Go refuses an unused import, so it
 * has none), with no reading of input and no placeholder answer.
 */
const SKELETON: Record<Language, string> = {
  python: `def main() -> None:
    pass


main()
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    return 0;
}
`,
  go: `package main

func main() {
}
`,
  java: `public class Main {
    public static void main(String[] args) {
    }
}
`,
};

/** The editor's starting code on a machine: the starter code on the first, the bare `main` on the rest. */
export function starterCodeFor(levelNumber: number): Record<Language, string> {
  return levelNumber === 1 ? STARTER_CODE : SKELETON;
}
