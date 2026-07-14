const WANDBOX_URL = "https://wandbox.org/api/compile.json";

export async function runCode({ compiler, code, stdin = "" }) {
    const res = await fetch(WANDBOX_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compiler, code, stdin }),
    });

    if (!res.ok) {
        throw new Error(`Wandbox request failed: ${res.status}`);
    }

    return res.json();
}
