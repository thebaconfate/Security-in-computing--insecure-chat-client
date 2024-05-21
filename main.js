const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const io = require("socket.io-client");
const SERVER = "localhost";
const PORT = 3000;

let userData = {
	username: undefined,
	chatRooms: undefined,
	directChats: undefined,
};

let token;
let socket;

function openLogin(win) {
	win.loadFile("public/login.html");
}

function openRegister(win) {
	win.loadFile("public/register.html");
}

function connectToServer() {
	if (!socket)
		socket = io(`ws://${SERVER}:${PORT}`, { transports: ["websocket"] });
	return socket;
}

function openDashboard(win, data) {
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

ipcMain.on("login", function (event, data) {
	const socket = connectToServer();
	socket.emit("authenticate", data, (response) => {
		console.log(response);
		if (response.success) {
			userData.username = data.username;
			token = response.token;
			openDashboard(BrowserWindow.getAllWindows()[0]);
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
	} else {
		dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
			type: "warning",
			buttons: ["Ok"],
			title: "Failure",
			normalizeAccessKeys: true,
			message: "Please provide a username and password to register",
		});
	}
});

ipcMain.on("get-user-data", function (event, arg) {
	if (!token) openLogin(BrowserWindow.getAllWindows()[0]);
	const socket = connectToServer();
	socket.emit("get-user-data", { token: token }, (response) => {
		console.log("user-data", response);
		if (response.success) {
			userData.rooms = response.data?.rooms;
			userData.users = response.data?.users;
			console.log(userData);
			event.sender.send("user-data", userData);
		}
	});
});

ipcMain.on("get-room", function (event, room) {
	if (!token) openLogin(BrowserWindow.getAllWindows()[0]);
	const socket = connectToServer();
	socket.emit("get-room", { token: token, room: room }, (response) => {
		console.log("get-room", response);
		if (response.success) {
			console.log(response);
			event.sender.send("set-room", response.room);
		}
	});
});

ipcMain.on("send-message", function (event, data) {
	if (!token) openLogin(BrowserWindow.getAllWindows()[0]);
	const socket = connectToServer();
	data.token = token;
	socket.emit("send-message", data, (response) => {
		console.log("message-sent", response);
		event.sender.send("message-sent", response);
	});
});

ipcMain.on("request_direct_room", function (event, data) {
	if (!token) openLogin(BrowserWindow.getAllWindows()[0]);
	const socket = connectToServer();
	data.token = token;
	socket.emit("request_direct_room", data, (response) => {
		console.log("requested direct room", response);
		event.sender.send("requested_direct_room", response);
	});
});
