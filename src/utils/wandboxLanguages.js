export const WANDBOX_LANGUAGE_MAP = {
    javascript: { compiler: "nodejs-20.17.0" },
    jsx: { compiler: "nodejs-20.17.0" },
    python: { compiler: "cpython-3.12.7" },
    go: { compiler: "go-1.23.2" },
    rust: { compiler: "rust-1.82.0" },
    ruby: { compiler: "ruby-3.4.9" },
    php: { compiler: "php-8.3.12" },
    swift: { compiler: "swift-6.0.1" },
    r: { compiler: "r-4.4.1" },
};

export const CLIKE_RUNTIMES = {
    c: { label: "C", compiler: "gcc-13.2.0-c" },
    cpp: { label: "C++", compiler: "gcc-13.2.0" },
    csharp: { label: "C#", compiler: "dotnetcore-8.0.402" },
    java: { label: "Java", compiler: "openjdk-jdk-21+35" },
};

const NON_RUNNABLE_MODES = new Set([
    "css",
    "dart",
    "django",
    "dockerfile",
    "htmlmixed",
    "markdown",
    "sass",
    "shell",
    "sql",
    "xml",
    "yaml",
]);

export function isRunnable(lang) {
    return lang === "clike" || (!!WANDBOX_LANGUAGE_MAP[lang] && !NON_RUNNABLE_MODES.has(lang));
}
