const { app, BrowserWindow, ipcMain, dialog } = require("electron");
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

	data.password = hash(data.password);

	const socket = connectToServer();
	socket.emit("authenticate", data, (response) => {
		if (response.success) {
			openChat(BrowserWindow.getAllWindows()[0], data);
		} else {
			dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
				type: "warning",
				buttons: ["Ok"],
				title: "Failure",
				normalizeAccessKeys: true,
				message: response.reason || "Login failed, unknown reason",
			});
		}
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
				dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
					type: "info",
					buttons: ["Ok"],
					title: "Success",
					normalizeAccessKeys: true,
					message:
						"Registration successful!\nPlease login through the login page",
				});
			} else {
				dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
					type: "warning",
					buttons: ["Ok"],
					title: "Failure",
					normalizeAccessKeys: true,
					message: response.reason || "Registration failed, unknown reason",
				});
			}
		});
	} else return;
});

ipcMain.on("get-user-data", function (event, arg) {
	event.sender.send("user-data", userData);
});
