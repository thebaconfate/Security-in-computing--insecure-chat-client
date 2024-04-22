const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

function openLogin(win) {
	win.loadFile("public/login.html");
}

function openChat(win, data) {
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
	name: false,
	password: false,
};

/*Function to be called from the client on login*/
ipcMain.on("login", function (event, data) {
	console.log(data);
	userData.name = data.name;
	userData.password = data.password;

	openChat(BrowserWindow.getAllWindows()[0], data);
});

ipcMain.on("get-user-data", function (event, arg) {
	event.sender.send("user-data", userData);
});
