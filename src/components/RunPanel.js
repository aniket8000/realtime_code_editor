import React, { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { useRecoilValue } from "recoil";
import { language } from "../../src/atoms";
import { WANDBOX_LANGUAGE_MAP, CLIKE_RUNTIMES, isRunnable } from "../utils/wandboxLanguages";
import { runCode } from "../utils/runCode";
import ACTIONS from "../actions/Actions";

const RunPanel = ({ getCode, socketRef, roomId }) => {
    const lang = useRecoilValue(language);
    const [runtime, setRuntime] = useState("cpp");
    const [isRunning, setIsRunning] = useState(false);
    const [output, setOutput] = useState(null);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [panelHeight, setPanelHeight] = useState(240);
    const dragStateRef = useRef(null);

    const runnable = isRunnable(lang);

    const handleDragMove = useCallback((e) => {
        if (!dragStateRef.current) return;
        const { startY, startHeight } = dragStateRef.current;
        const newHeight = startHeight + (startY - e.clientY);
        setPanelHeight(Math.min(Math.max(newHeight, 60), window.innerHeight * 0.9));
    }, []);

    const handleDragEnd = useCallback(() => {
        dragStateRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", handleDragMove);
        window.removeEventListener("mouseup", handleDragEnd);
    }, [handleDragMove]);

    const handleDragStart = (e) => {
        if (isMinimized || isMaximized) return;
        dragStateRef.current = { startY: e.clientY, startHeight: panelHeight };
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("mousemove", handleDragMove);
        window.addEventListener("mouseup", handleDragEnd);
    };

    useEffect(() => {
        return () => {
            window.removeEventListener("mousemove", handleDragMove);
            window.removeEventListener("mouseup", handleDragEnd);
        };
    }, [handleDragMove, handleDragEnd]);

    useEffect(() => {
        if (!socketRef.current) return;
        const onRunResult = ({ output: remoteOutput }) => {
            setOutput(remoteOutput);
        };
        socketRef.current.on(ACTIONS.RUN_RESULT, onRunResult);
        return () => socketRef.current.off(ACTIONS.RUN_RESULT, onRunResult);
    }, [socketRef.current]);

    async function handleRun() {
        if (!runnable) return;
        setIsRunning(true);
        setOutput(null);
        try {
            const target = lang === "clike" ? CLIKE_RUNTIMES[runtime] : WANDBOX_LANGUAGE_MAP[lang];
            const result = await runCode({
                compiler: target.compiler,
                code: getCode() || "",
            });
            const runOutput = {
                stdout: result.program_output,
                stderr: result.program_error || result.compiler_error,
                exitCode: result.status,
            };
            setOutput(runOutput);
            socketRef.current.emit(ACTIONS.RUN_RESULT, { roomId, output: runOutput });
        } catch (err) {
            console.error(err);
            toast.error("Failed to run code. Try again later.");
        } finally {
            setIsRunning(false);
        }
    }

    return (
        <>
            <div className="runControls">
                {lang === "clike" && (
                    <select
                        className="seLang clikeRuntimeSelect"
                        value={runtime}
                        onChange={(e) => setRuntime(e.target.value)}
                    >
                        {Object.entries(CLIKE_RUNTIMES).map(([key, { label }]) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                    </select>
                )}
                <button
                    className="btn runBtn"
                    onClick={handleRun}
                    disabled={!runnable || isRunning}
                    title={runnable ? "Run the current code" : "This language cannot be executed"}
                >
                    {isRunning ? "Running..." : "Run Code"}
                </button>
            </div>
            {output && (
                <div
                    className={
                        "runOutput" +
                        (isMinimized ? " runOutput--minimized" : "") +
                        (isMaximized ? " runOutput--maximized" : "")
                    }
                    style={isMinimized || isMaximized ? undefined : { height: panelHeight }}
                >
                    <div
                        className="runOutputDragHandle"
                        onMouseDown={handleDragStart}
                    />
                    <div className="runOutputHeader">
                        <span>Output</span>
                        <div className="runOutputControls">
                            <button
                                className="runOutputControlBtn"
                                onClick={() => setIsMinimized((v) => !v)}
                                title={isMinimized ? "Restore" : "Minimize"}
                            >
                                {isMinimized ? "▢" : "_"}
                            </button>
                            <button
                                className="runOutputControlBtn"
                                onClick={() => {
                                    setIsMaximized((v) => !v);
                                    setIsMinimized(false);
                                }}
                                title={isMaximized ? "Restore" : "Maximize"}
                            >
                                {isMaximized ? "❐" : "▭"}
                            </button>
                            <button
                                className="runOutputControlBtn"
                                onClick={() => setOutput(null)}
                                title="Close"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                    {!isMinimized && (
                        <div className="runOutputBody">
                            {output.stdout && (
                                <>
                                    <strong>Output:</strong>
                                    <pre>{output.stdout}</pre>
                                </>
                            )}
                            {output.stderr && (
                                <>
                                    <strong>Errors:</strong>
                                    <pre>{output.stderr}</pre>
                                </>
                            )}
                            <span>Exit code: {output.exitCode}</span>
                        </div>
                    )}
                </div>
            )}
        </>
    );
};

export default RunPanel;
