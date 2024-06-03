const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const io = require("socket.io-client");
const fs = require("fs");
const SERVER = "localhost";
const PORT = 3000;
const crypto = require("crypto");

let userData = {
	username: undefined,
};

let connected;
let token;
let socket;
let win;
let currentRoom;

function saveCurrentRoom(room) {
	currentRoom = { ID: room.ID, members: room.members };
}

function getPrivateKey() {
	if (userData.username)
		return fs.readFileSync(`${userData.username}_private_key.pem`, "utf-8");
	return null;
}

function encryptMessage(message, aesKey) {
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
	let encrypted = cipher.update(message, "utf8", "hex");
	encrypted += cipher.final("hex");
	return Buffer.concat([iv, Buffer.from(encrypted, "hex")]);
}

function decryptMessage(encrypted, aesKey) {
	const iv = encrypted.subarray(0, 16);
	encrypted = encrypted.subarray(16);
	const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
	let decrypted = decipher.update(encrypted, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
}

function generateAesKey() {
	return crypto.randomBytes(32);
}

function encryptAesKey(aesKey, members) {
	console.log("members", members);
	return members.map((member) => {
		console.log("userData", userData);
		const user =
			userData.users.find((user) => user.username === member) || userData;
		return {
			ID: user.ID,
			key: crypto.publicEncrypt(user.publicKey, aesKey),
		};
	});
}

function decryptAesKey(encryptedAesKey, privateKey) {
	return crypto.privateDecrypt(privateKey, encryptedAesKey);
}

function isDirectOrPrivate(roomID) {
	const room = userData.rooms.find((room) => room.ID === roomID);
	return room == undefined || room.private;
}

function openLogin() {
	win.loadFile("public/login.html");
}

function openRegister() {
	win.loadFile("public/register.html");
}

function connectToServer() {
	if (!socket || !connected) {
		socket = io(`ws://${SERVER}:${PORT}`, { transports: ["websocket"] });
		connected = true;
		initSocket(socket);
	}
	return socket;
}

function openDashboard(data) {
	win.loadFile("public/chat.html");
}

function createWindow() {
	win = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

	openLogin();
}

app.whenReady().then(() => {
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

function initSocket(socket) {
	socket.on("new message", (message) => {
		console.log("new message", message);

		const decryptionKeys = message.decryptionKeys;
		if (decryptionKeys) {
			const decryptionKey = decryptionKeys.find(
				(key) => key.ID === userData.ID
			);
			if (decryptionKey) {
				const aesKey = decryptAesKey(decryptionKey.key, getPrivateKey());
				message.content = decryptMessage(message.content, aesKey);
			}
		} else {
			message.content = message.content.toString("utf-8");
		}
		win.webContents.send("new message", message);
	});

	socket.on("disconnect", () => {
		console.log("disconnected");
		connected = false;
	});

	socket.on("update_room", (room) => {
		console.log("update_room", room);
		if (room.ID === currentRoom.ID) saveCurrentRoom(room);
		win.webContents.send("update_room", room);
	});

	socket.on("update_public_channels", (channels) => {
		win.webContents.send("update_public_channels", channels);
	});

	socket.on("remove_room", (room) => {
		if (room.ID === currentRoom.ID) currentRoom = undefined;
		win.webContents.send("remove_room", room);
	});

	socket.on("update_user", (data) => {
		console.log("update_user", data);
		if (data.action === "removed" && data.room == currentRoom.ID)
			saveCurrentRoom({ ID: data.room, members: data.members });
		win.webContents.send("update_user", data);
	});
	socket.on("user_state_change", (data) => {
		win.webContents.send("user_state_change", data);
	});
}

ipcMain.on("login", function (event, data) {
	const socket = connectToServer();
	socket.emit("authenticate", data, (response) => {
		if (response.success) {
			userData.username = data.username;
			console.log("response", response);
			userData.ID = response.ID;
			token = response.token;
			userData.publicKey = response.publicKey;
			openDashboard(win);
		} else {
			dialog.showMessageBox(win, {
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
	openRegister();
});

ipcMain.on("nav-login", function (event, arg) {
	openLogin();
});

ipcMain.on("register", function (event, data) {
	if (data.username && data.password) {
		let socket = connectToServer();
		const keyPair = crypto.generateKeyPairSync("rsa", {
			modulusLength: 2048,
			publicKeyEncoding: {
				type: "spki",
				format: "pem",
			},
			privateKeyEncoding: {
				type: "pkcs8",
				format: "pem",
			},
		});
		data.publicKey = keyPair.publicKey;
		socket.emit("register", data, (response) => {
			if (response.success) {
				dialog.showMessageBox(win, {
					type: "info",
					buttons: ["Ok"],
					title: "Success",
					normalizeAccessKeys: true,
					message:
						"Registration successful!\nPlease login through the login page",
				});
				fs.writeFileSync(
					`keys/${data.username}_private_key.pem`,
					keyPair.privateKey
				);
			} else {
				dialog.showMessageBox(win, {
					type: "warning",
					buttons: ["Ok"],
					title: "Failure",
					normalizeAccessKeys: true,
					message: response.reason || "Registration failed, unknown reason",
				});
			}
		});
	} else {
		dialog.showMessageBox(win, {
			type: "warning",
			buttons: ["Ok"],
			title: "Failure",
			normalizeAccessKeys: true,
			message: "Please provide a username and password to register",
		});
	}
});

ipcMain.on("get-user-data", function (event, arg) {
	if (!token) openLogin();
	const socket = connectToServer();
	socket.emit("get-user-data", { token: token }, (response) => {
		if (response.success) {
			console.log("user-data", response.data);
			userData.rooms = response.data?.rooms;
			userData.users = response.data?.users;
			userData.publicChannels = response.data?.publicChannels;
			event.sender.send("user-data", userData);
		}
	});
});

ipcMain.on("get-room", function (event, room) {
	if (!token) openLogin();
	const socket = connectToServer();
	socket.emit("get-room", { token: token, room: room }, (response) => {
		if (response.success) {
			saveCurrentRoom(response.room);
			if (response.room.private || response.room.direct) {
				response.room.history = response.room.history.map((msg) => {
					const privateKey = getPrivateKey();
					const decryptionKey = decryptAesKey(msg.decryptionKey, privateKey);
					msg.content = decryptMessage(msg.content, decryptionKey);
					return msg;
				});
			} else {
				response.room.history = response.room.history.map((msg) => {
					msg.content = msg.content.toString("utf-8");
					return msg;
				});
			}
			event.sender.send("set-room", response.room);
		}
	});
});

ipcMain.on("send-message", function (event, data) {
	if (!token) openLogin();
	const socket = connectToServer();
	data.token = token;
	console.log("sending message", data);
	if (isDirectOrPrivate(data.message.room)) {
		const aesKey = generateAesKey();
		console.log("aesKey", aesKey);
		data.message.content = encryptMessage(data.message.content, aesKey);
		data.decryptionKeys = encryptAesKey(aesKey, currentRoom.members);
	} else {
		data.message.content = Buffer.from(data.message.content, "utf-8");
	}
	socket.emit("send-message", data, (response) => {
		if (!response.success) {
			dialog.showMessageBox(win, {
				type: "warning",
				buttons: ["Ok"],
				title: "Failure",
				normalizeAccessKeys: true,
				message: response.reason || "Failed to send message",
			});
		}
	});
});

ipcMain.on("request_direct_room", function (event, data) {
	if (!token) openLogin();
	const socket = connectToServer();
	data.token = token;
	socket.emit("request_direct_room", data, (response) => {
		event.sender.send("requested_direct_room", response);
	});
});

ipcMain.on("add_channel", function (event, data) {
	if (!token) openLogin();
	const socket = connectToServer();
	data.token = token;
	socket.emit("add_channel", data);
});

ipcMain.on("join_channel", function (event, data) {
	if (!token) openLogin();
	const socket = connectToServer();
	data.token = token;
	socket.emit("join_channel", data);
});

ipcMain.on("add_user_to_channel", function (event, data) {
	if (!token) openLogin();
	const socket = connectToServer();
	data.token = token;
	socket.emit("add_user_to_channel", data);
});

ipcMain.on("leave_channel", function (event, data) {
	if (!token) openLogin();
	const socket = connectToServer();
	data.token = token;
	socket.emit("leave_channel", data);
});
