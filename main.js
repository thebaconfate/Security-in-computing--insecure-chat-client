const { app, BrowserWindow, ipcMain } = require("electron");
const { hash } = require("./crypto.js");
const path = require("node:path");
const io = require("socket.io-client");
const SERVER = "localhost";
const PORT = 3000;

function openLogin(win) {
	win.loadFile("public/login.html");
}

function openRegister(win) {
	win.loadFile("public/register.html");
}

function connectToServer() {
	return io(`ws://${SERVER}:${PORT}`, { transports: ["websocket"] });
}

function login(win, credentials) {
	let socket = connectToServer();
	console.log("logging in with: ", credentials);
	socket.emit("authenticate", credentials);

	socket.on("login", function (data) {
		openChat(win, credentials);
	});
}

function openChat(win, data) {
	/* loads the chat window with data*/
	win.loadFile("public/chat.html");
}

function createWindow() {
	const win = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	openLogin(win);
}

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

let userData = {
	username: false,
	password: false,
};

ipcMain.on("login", function (event, data) {
	/*Function to be called from the client on login, passes data load the chat window,
	doesn't call login to the server */

	userData.username = data.usernname;
	userData.password = data.password;

	login(BrowserWindow.getAllWindows()[0], {
		username: data.username,
		password: hash(data.password),
	});
});

ipcMain.on("nav-register", function (event, arg) {
	openRegister(BrowserWindow.getAllWindows()[0]);
});

ipcMain.on("nav-login", function (event, arg) {
	openLogin(BrowserWindow.getAllWindows()[0]);
});

ipcMain.on("register", function (event, data) {
	if (data.username && data.password) {
		let socket = connectToServer();
		data.password = hash(data.password);
		socket.emit("register", data, (response) => {
			console.log(response);
			if (response.success) {
				event.sender.send("registration-successful");
			} else {
				event.sender.send("registration-failed", response.reason);
			}
		});
	}
});

ipcMain.on("get-user-data", function (event, arg) {
	event.sender.send("user-data", userData);
});
