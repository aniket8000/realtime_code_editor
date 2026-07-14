import React, { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import Client from "../components/Client";
import Editor from "../components/Editor";
import FilePreview from "../components/FilePreview";
import RunPanel from "../components/RunPanel";
import ChatPanel from "../components/ChatPanel";
import { LANG_EXTENSION_MAP } from "../utils/languageExtensions";
import { language, cmtheme } from "../../src/atoms";
import { useRecoilState } from "recoil";
import ACTIONS from "../actions/Actions";
import { initSocket } from "../socket";
import {
  useLocation,
  useNavigate,
  Navigate,
  useParams,
} from "react-router-dom";

const EditorPage = () => {
  const [lang, setLang] = useRecoilState(language);
  const [them, setThem] = useRecoilState(cmtheme);

  const [clients, setClients] = useState([]);

  const socketRef = useRef(null);
  const codeRef = useRef(null);
  const location = useLocation();
  const { roomId } = useParams();
  const reactNavigator = useNavigate();

  const [filePreview, setFilePreview] = useState(false);
  const [fileContent, setFileContent] = useState("");
  const fileInputRef = useRef(null);
  const editorInstanceRef = useRef(null);

  const [isOwner, setIsOwner] = useState(false);
  const [locked, setLocked] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatOpenRef = useRef(false);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  useEffect(() => {
    const init = async () => {
      socketRef.current = await initSocket();
      socketRef.current.on("connect_error", (err) => handleErrors(err));
      socketRef.current.on("connect_failed", (err) => handleErrors(err));

      function handleErrors(e) {
        console.log("socket error", e);
        toast.error("Socket connection failed, try again later.");
        reactNavigator("/");
      }

      socketRef.current.emit(ACTIONS.JOIN, {
        roomId,
        username: location.state?.username,
      });

      // Listening for joined event
      socketRef.current.on(
        ACTIONS.JOINED,
        ({ clients, username, socketId, isOwner: joinerIsOwner }) => {
          if (username !== location.state?.username) {
            toast.success(`${username} joined the room.`);
            console.log(`${username} joined`);
          }
          setClients(clients);
          setIsOwner(joinerIsOwner);
          socketRef.current.emit(ACTIONS.SYNC_CODE, {
            code: codeRef.current,
            socketId,
          });
        }
      );

      // Listening for disconnected
      socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
        toast.success(`${username} left the room.`);
        setClients((prev) => {
          return prev.filter((client) => client.socketId !== socketId);
        });
      });

      // Listening for a language change from another user in the room
      socketRef.current.on(ACTIONS.LANGUAGE_CHANGE, ({ lang: newLang }) => {
        if (newLang !== lang) {
          setLang(newLang);
          window.location.reload();
        }
      });

      // Listening for the room's lock state
      socketRef.current.on(ACTIONS.ROOM_LOCK_STATE, ({ locked: roomLocked }) => {
        setLocked(roomLocked);
      });

      // Listening for chat history sent on join
      socketRef.current.on(ACTIONS.CHAT_HISTORY, ({ messages }) => {
        setChatMessages(messages);
      });

      // Listening for new chat messages
      socketRef.current.on(ACTIONS.CHAT_MESSAGE, (entry) => {
        setChatMessages((prev) => [...prev, entry]);
        if (!chatOpenRef.current && entry.username !== location.state?.username) {
          setUnreadCount((c) => c + 1);
          toast(`${entry.username}: ${entry.message}`, { icon: "💬" });
        }
      });

      // Listening for being kicked by the room owner
      socketRef.current.on(ACTIONS.KICKED, ({ reason }) => {
        toast.error(reason || "You were removed from the room.");
        reactNavigator("/");
      });

      // Listening for a rejected join (e.g. room is locked)
      socketRef.current.on(ACTIONS.JOIN_REJECTED, ({ reason }) => {
        toast.error(reason || "Unable to join the room.");
        reactNavigator("/");
      });
    };
    init();
    return () => {
      socketRef.current.off(ACTIONS.JOINED);
      socketRef.current.off(ACTIONS.DISCONNECTED);
      socketRef.current.off(ACTIONS.LANGUAGE_CHANGE);
      socketRef.current.off(ACTIONS.ROOM_LOCK_STATE);
      socketRef.current.off(ACTIONS.CHAT_HISTORY);
      socketRef.current.off(ACTIONS.CHAT_MESSAGE);
      socketRef.current.off(ACTIONS.KICKED);
      socketRef.current.off(ACTIONS.JOIN_REJECTED);
      socketRef.current.disconnect();
    };
  }, []);

  async function copyRoomId() {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success("Room ID has been copied to clipboard");
    } catch (err) {
      toast.error("Could not copy the Room ID");
      console.error(err);
    }
  }

  function leaveRoom() {
    reactNavigator("/");
  }

  function handleDownload() {
    const ext = LANG_EXTENSION_MAP[lang] || "txt";
    const blob = new Blob([codeRef.current || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `code.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function toggleLock() {
    socketRef.current.emit(ACTIONS.TOGGLE_LOCK, { roomId });
  }

  function kickUser(targetSocketId) {
    socketRef.current.emit(ACTIONS.KICK_USER, { roomId, targetSocketId });
  }

  function sendChatMessage(message) {
    socketRef.current.emit(ACTIONS.CHAT_MESSAGE, { roomId, message });
  }

  if (!location.state) {
    return <Navigate to="/" />;
  }

  function handleFileUpload(event) {
    console.log("hello");
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const fileContent = e.target.result;
        setFileContent(fileContent);
        setFilePreview(true);
      };
      reader.readAsText(file);
    }
  }
  const resetFileInput = () => {
    if (fileInputRef.current) {
    fileInputRef.current.value = "";
    }
  };

  const updateEditorCode = (newCode) => {
    editorInstanceRef.current?.setCode(newCode);
    codeRef.current = newCode;
    socketRef.current.emit(ACTIONS.CODE_CHANGE, {
      roomId,
      code: newCode,
    });
  };

  const handleAppendCode = () => {
  const currentCode = codeRef.current || "";

  const appendedCode = currentCode
    ? `${currentCode}\n\n${fileContent}`
    : fileContent;

    updateEditorCode(appendedCode);
    setFilePreview(false);
    resetFileInput();
  };

  const handleReplaceCode = () => {
    updateEditorCode(fileContent);
    setFilePreview(false);
    resetFileInput();
  };



  return (
    <div className="mainWrap">
      <div className="aside">
        <div className="logo">
          <img className="logoImage" src="/logo.png" alt="logo" />
        </div>

        <div className="asideScroll">
          <div className="asideSection">
            <h3 className="asideSectionTitle">Connected</h3>
            <div className="clientsList">
              {clients.map((client) => (
                <Client
                  key={client.socketId}
                  username={client.username}
                  onKick={
                    isOwner && client.socketId !== socketRef.current?.id
                      ? () => kickUser(client.socketId)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>

          <div className="asideSection">
            <h3 className="asideSectionTitle">File</h3>
            <input type="file" accept=".js,.py,.java,.cpp,.c,.txt,.html,.css" style={{ display: "none" }} id="fileUpload" onChange={handleFileUpload} ref={fileInputRef} />
            <button className="uploadFileBtn" onClick={() => document.getElementById("fileUpload").click()}>
              Upload File
            </button>
            <button className="btn downloadBtn" onClick={handleDownload}>
              Download Code
            </button>
            {
              filePreview && <FilePreview
                setFilePreview={setFilePreview}
                fileContent={fileContent}
                resetFileInput={resetFileInput}
                onAppend={handleAppendCode}
                onReplace={handleReplaceCode}/>
            }
          </div>

          <div className="asideSection">
            <h3 className="asideSectionTitle">Settings</h3>
            <label>
              Select Language:
              <select
            value={lang}
            onChange={(e) => {
              setLang(e.target.value);
              socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, {
                roomId,
                lang: e.target.value,
              });
              window.location.reload();
            }}
            className="seLang"
          >
            <option value="clike">C / C++ / C# / Java</option>
            <option value="css">CSS</option>
            <option value="dart">Dart</option>
            <option value="django">Django</option>
            <option value="dockerfile">Dockerfile</option>
            <option value="go">Go</option>
            <option value="htmlmixed">HTML-mixed</option>
            <option value="javascript">JavaScript</option>
            <option value="jsx">JSX</option>
            <option value="markdown">Markdown</option>
            <option value="php">PHP</option>
            <option value="python">Python</option>
            <option value="r">R</option>
            <option value="rust">Rust</option>
            <option value="ruby">Ruby</option>
            <option value="sass">Sass</option>
            <option value="shell">Shell</option>
            <option value="sql">SQL</option>
            <option value="swift">Swift</option>
            <option value="xml">XML</option>
            <option value="yaml">yaml</option>
          </select>
        </label>

        <label>
          Select Theme:
          <select
            value={them}
            onChange={(e) => {
              //   setCode(codeRef.current);
              setThem(e.target.value);
              //   window.location.reload();
            }}
            className="seLang"
          >
            <option value="default">default</option>
            <option value="3024-day">3024-day</option>
            <option value="3024-night">3024-night</option>
            <option value="abbott">abbott</option>
            <option value="abcdef">abcdef</option>
            <option value="ambiance">ambiance</option>
            <option value="ayu-dark">ayu-dark</option>
            <option value="ayu-mirage">ayu-mirage</option>
            <option value="base16-dark">base16-dark</option>
            <option value="base16-light">base16-light</option>
            <option value="bespin">bespin</option>
            <option value="blackboard">blackboard</option>
            <option value="cobalt">cobalt</option>
            <option value="colorforth">colorforth</option>
            <option value="darcula">darcula</option>
            <option value="duotone-dark">duotone-dark</option>
            <option value="duotone-light">duotone-light</option>
            <option value="eclipse">eclipse</option>
            <option value="elegant">elegant</option>
            <option value="erlang-dark">erlang-dark</option>
            <option value="gruvbox-dark">gruvbox-dark</option>
            <option value="hopscotch">hopscotch</option>
            <option value="icecoder">icecoder</option>
            <option value="idea">idea</option>
            <option value="isotope">isotope</option>
            <option value="juejin">juejin</option>
            <option value="lesser-dark">lesser-dark</option>
            <option value="liquibyte">liquibyte</option>
            <option value="lucario">lucario</option>
            <option value="material">material</option>
            <option value="material-darker">material-darker</option>
            <option value="material-palenight">material-palenight</option>
            <option value="material-ocean">material-ocean</option>
            <option value="mbo">mbo</option>
            <option value="mdn-like">mdn-like</option>
            <option value="midnight">midnight</option>
            <option value="monokai">monokai</option>
            <option value="moxer">moxer</option>
            <option value="neat">neat</option>
            <option value="neo">neo</option>
            <option value="night">night</option>
            <option value="nord">nord</option>
            <option value="oceanic-next">oceanic-next</option>
            <option value="panda-syntax">panda-syntax</option>
            <option value="paraiso-dark">paraiso-dark</option>
            <option value="paraiso-light">paraiso-light</option>
            <option value="pastel-on-dark">pastel-on-dark</option>
            <option value="railscasts">railscasts</option>
            <option value="rubyblue">rubyblue</option>
            <option value="seti">seti</option>
            <option value="shadowfox">shadowfox</option>
            <option value="solarized">solarized</option>
            <option value="the-matrix">the-matrix</option>
            <option value="tomorrow-night-bright">tomorrow-night-bright</option>
            <option value="tomorrow-night-eighties">
              tomorrow-night-eighties
            </option>
            <option value="ttcn">ttcn</option>
            <option value="twilight">twilight</option>
            <option value="vibrant-ink">vibrant-ink</option>
            <option value="xq-dark">xq-dark</option>
            <option value="xq-light">xq-light</option>
            <option value="yeti">yeti</option>
            <option value="yonce">yonce</option>
            <option value="zenburn">zenburn</option>
          </select>
            </label>
          </div>

          <div className="asideSection">
            <h3 className="asideSectionTitle">Room</h3>
            {isOwner ? (
              <button className="btn lockBtn" onClick={toggleLock}>
                {locked ? "Unlock Room" : "Lock Room"}
              </button>
            ) : (
              locked && (
                <span
                  className="lockBadge"
                  title="Ownership is by username only — not authenticated"
                >
                  Room Locked
                </span>
              )
            )}

            <button className="btn chatToggleBtn" onClick={() => setChatOpen((o) => !o)}>
              {chatOpen ? "Close Chat" : "Chat"}
              {unreadCount > 0 && <span className="chatUnreadBadge">{unreadCount}</span>}
            </button>

            <button className="btn copyBtn" onClick={copyRoomId}>
              Copy ROOM ID
            </button>
          </div>
        </div>

        <div className="asideFooter">
          <button className="btn leaveBtn" onClick={leaveRoom}>
            Leave
          </button>
        </div>
      </div>

      <div className="editorWrap">
        <RunPanel getCode={() => codeRef.current} socketRef={socketRef} roomId={roomId} />
        <Editor
          ref={editorInstanceRef}
          socketRef={socketRef}
          roomId={roomId}
          onCodeChange={(code) => {
            console.log("on code change" + code);
            codeRef.current = code;
          }}
        />
      </div>

      {chatOpen && (
        <ChatPanel
          messages={chatMessages}
          onSend={sendChatMessage}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
};

export default EditorPage;
