# Sync Code: Realtime Collaborative Code Editor

## Introduction

Are you tired of sending code snippets back and forth, struggling to debug and collaborate with your team? Look no further! **Sync Code** is here to revolutionize the way you code together. This powerful and intuitive collaborative code editor is designed to empower developers, and teams to work seamlessly in real-time, regardless of their location. With **Sync Code**, you can code together, debug together, run code together, and ship faster, together.

## Features

### Core collaboration

- Multiple users can join a room and edit code together
- Changes are reflected in real time
- Live collaborative cursors — see every connected user's cursor position and text selection, each in its own color, live as they type (like Google Docs)
- Copy button to copy the room id to clipboard
- Leave button to leave the room
- Supports syntax highlighting for 20+ programming languages
- Users can choose an editor theme based on their preferences (60+ themes)
- Users can leave the room and rejoin later to continue editing
- Joining & leaving of users is also reflected in real time
- Language selection is synced across the whole room, so everyone sees and edits the same language mode
- Rooms persist across a server restart — code, language, and chat history are saved and automatically restored when the room is rejoined

### Run Code

- Run the current code directly from the editor via a "Run Code" button (powered by the free [Wandbox](https://wandbox.org/) API — no API key needed)
- Supports running JavaScript, Python, Go, Rust, Ruby, PHP, Swift, R, and C/C++/C#/Java (with a runtime picker for the ambiguous C-family mode)
- Output (stdout/stderr/exit code) is broadcast to everyone in the room, so the whole team sees the same run result
- Output panel is resizable (drag the top edge) and can be minimized, maximized, or closed

### Chat

- Built-in chat sidebar scoped to the room, so you don't need a separate app open alongside the editor
- Chat history is saved per room and restored for new joiners and after a server restart
- Unread message badge + toast notification when a new message arrives while the chat panel is closed

### Room owner controls

- The first person to join a room becomes its owner
- Owners can lock a room to prevent new users from joining mid-session
- Owners can kick a disruptive user out of the room
- **Note:** ownership is tracked by username only, since the app has no authentication/login system — this is a convenience feature for casual/trusted use, not a security boundary

### File & code management

- Upload a local code file, preview it, and choose to append or replace the current editor content
- Download the current code as a file, with the extension automatically matched to the selected language

## Tech Stack

- React.js
- Node.js
- Express.js
- Socket.io
- CodeMirror
- Recoil
- React Hot Toast

### Prerequisites

#### For running via Docker

- Docker (25.0.4)
- Docker Compose (1.29.2)

#### For running locally

- Node.js (v20.11.1)
- npm (10.2.4)
- pm2 (5.3.1) : run `npm i -g pm2` to install pm2 globally

**Note:** nvm (v0.39.7) can be used to manage node versions. View nvm official [documentation](https://github.com/nvm-sh/nvm) to install it.

## Installation

### Running via Docker Image (highly recommended)

To run the docker image, follow the steps below:

1. Install [Docker](https://www.docker.com/) on your machine.
2. Pull the docker image from the docker hub by running `docker pull <docker-image-name>`
3. Run the docker image by running `docker run -p 8000:8000 -p 3000:3000 -p 5000:5000 <docker-image-name>`
4. Go to `http://localhost:3000` to view the app
5. Create a room by clicking on the `create new room` button and put a username of your choice, then copy the room id by clicking on the `Copy ROOM ID` button
6. To join as an another user open another browser/browser-window or an incognito tab and go to `http://localhost:3000`
7. Enter the same room id to join the same room

Now both your editor will be synced and you can see the changes in real time. Try opening the same room in multiple browsers/browsers-windows and see the changes.

**Note:** If you are using docker in wsl2/linux then add `sudo` before the docker commands.

### Running via building your own Docker Image

To run the app using docker, follow the steps below:

1. Install [Docker](https://www.docker.com/) on your machine.
2. Clone the project repository and Navigate to the project directory.
3. Also you have to change ENV values in the Dockerfile
4. Replace your username in docker-compose.yml file.
5. Run the Docker Compose command: `docker-compose up -d`
6. Go to `http://localhost:3000` to view the app
7. Follow the steps 5-7 from the [Running via Docker Image](#running-via-docker-image-highly-recommended) section to create and join a room

### Running Locally

#### 1. Clone & Install

```
git clone <this-repository-url>
cd Realtime-Collaborative-Code-Editor
npm install
```

Then create a `.env` file in the root folder by copying `example.env`, and fill in the values:

```
REACT_APP_BACKEND_URL=http://localhost:5000
SERVER_PORT=5000
```

#### 2. Run the Backend

In one terminal, from the project root:

```
npm run server:dev
```

(or `pm2 start server.js` / `node server.js`)

#### 3. Run the Frontend

In a separate terminal, from the project root:

```
npm start
```

This opens `http://localhost:3000` automatically in your browser.

#### 4. Create/Join a Room

Follow steps 5-7 from the [Running via Docker Image](#running-via-docker-image-highly-recommended) section to create and join a room.

**Note:** To stop the backend server, press `Ctrl+c` or if you used "pm2", then use `pm2 stop server.js` in the terminal.

**Note:** If you find any bugs, please create an Issue in this repository. <br>
In case you want to fix it yourself, feel free to make a pull request.
