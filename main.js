const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const io = require("socket.io-client");
const fs = require("fs");
const SERVER = "localhost";
const PORT = 3000;
const crypto = require("crypto");
const sanitizeHtml = require("sanitize-html");
const validator = require("validator");

const keysDir = "keys";
if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir);

function removeHtmlTags(input) {
	return sanitizeHtml(input, { allowedTags: [] });
}

function pureSanitizeInput(input) {
	return validator.escape(removeHtmlTags(input));
}

function sanitizeInput(input) {
	return validator.escape(input);
}

function sanitizeCredentials(input) {
	const regex = `a-zA-Z0-9`;
	return validator.whitelist(removeHtmlTags(input), regex);
}

let userData = {
	username: undefined,
};

let connected;
let token;
let socket;
let win;
let currentRoom;
let serverPublicKey;

function saveCurrentRoom(room) {
	currentRoom = { ID: room.ID, members: room.members };
}

function getPrivateKey() {
	if (userData.username)
		return fs.readFileSync(
			`keys/${userData.username}_private_key.pem`,
			"utf-8"
		);
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
	return members.map((member) => {
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

function encryptPublicMessage(message) {
	console.log("encryptPublicMessage", serverPublicKey);
	return crypto.publicEncrypt(serverPublicKey, message);
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
		const decryptionKeys = message.decryptionKeys;
		const decryptionKey = decryptionKeys.find((key) => key.ID === userData.ID);
		const aesKey = decryptAesKey(decryptionKey.key, getPrivateKey());
		message.content = decryptMessage(message.content, aesKey);
		win.webContents.send("new message", message);
	});

	socket.on("disconnect", () => {
		connected = false;
	});

	socket.on("update_room", (room) => {
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
		if (data.action === "removed" && data.room == currentRoom.ID)
			saveCurrentRoom({ ID: data.room, members: data.members });
		win.webContents.send("update_user", data);
	});

	socket.on("new-user", (user) => {
		if (userData?.users) {
			userData.users.push(user);
			win.webContents.send("new_user", user);
		}
	});

	socket.on("user_state_change", (data) => {
		win.webContents.send("user_state_change", data);
	});
}

ipcMain.on("login", function (event, creds) {
	if (!creds?.username || !creds?.password) return;
	const socket = connectToServer();
	const data = {
		username: sanitizeCredentials(creds.username),
		password: sanitizeCredentials(creds.password),
	};
	socket.emit("authenticate", data, (response) => {
		if (response.success) {
			userData.username = data.username;
			userData.ID = response.ID;
			token = response.token;
			userData.publicKey = response.publicKey;
			serverPublicKey = response.serverPublicKey;
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

ipcMain.on("register", function (event, creds) {
	if (creds?.username && creds?.password) {
		const data = {
			username: sanitizeCredentials(creds.username),
			password: sanitizeCredentials(creds.password),
		};
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
			userData.rooms = response.data?.rooms;
			userData.users = response.data?.users;
			userData.publicChannels = response.data?.publicChannels;
			event.sender.send("user-data", userData);
		}
	});
});

ipcMain.on("get-room", function (event, room) {
	if (!token) openLogin();
	try {
		if (validator.isInt(room?.toString())) {
			const socket = connectToServer();
			socket.emit("get-room", { token: token, room: room }, (response) => {
				if (response.success) {
					saveCurrentRoom(response.room);
					response.room.history = response.room.history.map((msg) => {
						const privateKey = getPrivateKey();
						const decryptionKey = decryptAesKey(msg.decryptionKey, privateKey);
						msg.content = decryptMessage(msg.content, decryptionKey);
						return msg;
					});
					event.sender.send("set-room", response.room);
				}
			});
		}
	} catch (e) {
		return;
	}
});

ipcMain.on("send-message", function (event, rawData) {
	try {
		if (
			rawData?.message?.content &&
			rawData?.message?.room &&
			validator.isInt(rawData.message.room.toString())
		) {
			const data = {
				message: {
					content: sanitizeInput(rawData.message.content),
					room: rawData.message.room,
				},
				token: token,
			};
			if (!token) openLogin();
			const socket = connectToServer();
			if (isDirectOrPrivate(data.message.room)) {
				const aesKey = generateAesKey();
				data.message.content = encryptMessage(data.message.content, aesKey);
				data.decryptionKeys = encryptAesKey(aesKey, currentRoom.members);
			} else data.message.content = encryptPublicMessage(data.message.content);
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
		}
	} catch (e) {
		return;
	}
});

ipcMain.on("request_direct_room", function (event, recipient) {
	if (!token) openLogin();
	try {
		if (recipient?.to && validator.isInt(recipient.to?.toString())) {
			const data = {
				to: recipient.to,
				token: token,
			};
			const socket = connectToServer();
			socket.emit("request_direct_room", data, (response) => {
				event.sender.send("requested_direct_room", response);
			});
		}
	} catch (e) {
		return;
	}
});

ipcMain.on("add_channel", function (event, rawData) {
	if (!token) openLogin();
	try {
		if (
			rawData?.name &&
			rawData?.description &&
			rawData?.private &&
			validator.isBoolean(rawData.private.toString())
		) {
			const data = {
				name: removeHtmlTags(rawData.name),
				description: removeHtmlTags(rawData.description),
				private: rawData.private,
				token: token,
			};
			const socket = connectToServer();
			socket.emit("add_channel", data);
		}
	} catch (e) {
		return;
	}
});

ipcMain.on("join_channel", function (event, rawData) {
	if (!token) openLogin();
	try {
		if (validator.isInt(rawData?.ID?.toString())) {
			const data = { ID: rawData.ID, token: token };
			const socket = connectToServer();
			data.token = token;
			socket.emit("join_channel", data);
		}
	} catch (e) {
		return;
	}
});

ipcMain.on("add_user_to_channel", function (event, rawData) {
	if (!token) openLogin();
	try {
		if (
			rawData?.channel &&
			rawData?.user &&
			validator.isInt(rawData.channel.toString())
		) {
			const data = {
				channel: rawData.channel,
				user: sanitizeCredentials(rawData.user),
				token: token,
			};
			const socket = connectToServer();
			socket.emit("add_user_to_channel", data);
		}
	} catch (e) {
		return;
	}
});

ipcMain.on("leave_channel", function (event, rawData) {
	if (!token) openLogin();
	try {
		if (validator.isInt(rawData?.ID?.toString())) {
			const socket = connectToServer();
			const data = { ID: rawData.ID, token: token };
			socket.emit("leave_channel", data);
		}
	} catch (e) {
		return;
	}
});
