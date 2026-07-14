import React, { useState } from "react";

const ChatPanel = ({ messages, onSend, onClose }) => {
    const [draft, setDraft] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onSend(draft);
        setDraft("");
    };

    return (
        <div className="chatPanel">
            <div className="chatPanelHeader">
                <span>Chat</span>
                <button className="chatPanelCloseBtn" onClick={onClose} title="Close">
                    ✕
                </button>
            </div>
            <div className="chatPanelBody">
                {messages.map((m, i) => (
                    <div key={i} className="chatMessage">
                        <div className="chatMessageMeta">
                            <strong>{m.username}</strong>
                            <span className="chatTs">
                                {new Date(m.ts).toLocaleTimeString()}
                            </span>
                        </div>
                        <p>{m.message}</p>
                    </div>
                ))}
            </div>
            <form className="chatPanelInput" onSubmit={handleSubmit}>
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message..."
                />
                <button type="submit">Send</button>
            </form>
        </div>
    );
};

export default ChatPanel;
