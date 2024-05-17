const io = require("socket.io-client");
const electron = require("electron");
const ipcRender = electron.ipcRenderer;

const SERVER = "localhost";
const PORT = 3000;
let directChats = {};

$(function () {
	// Get user data
	electron.ipcRenderer.send("get-user-data");

	electron.ipcRenderer.on("user-data", function (event, data) {
		loadPage(data);
	});
});

function loadPage(userData) {
	console.log("Loading UI", userData);

	// Initialize variables
	const $window = $(window);
	const $messages = $(".messages"); // Messages area
	const $inputMessage = $("#input-message"); // Input message input box
	const $usernameLabel = $("#user-name");
	const $roomList = $("#room-list");
	const $userList = $("#user-list");

	let username = userData.username;
	$usernameLabel.text(username);
	let chatRooms = userData.chatRooms || [];
	updateRoomList();
	directChats = userData.directChats;

	// Connect to server
	let connected = false;
	let socket = io(`ws://${SERVER}:${PORT}`, { transports: ["websocket"] });

	let modalShowing = false;

	$("#addChannelModal")
		.on("hide.bs.modal", () => {
			modalShowing = false;
		})
		.on("show.bs.modal", () => {
			console.log("show");
			modalShowing = true;
		});

	///////////////
	// User List //
	///////////////

	function unzip(list) {
		let dict = {};
		list.forEach((item) => (dict[item.username] = item.ID));
	}

	let users = {};

	function updateUsers(p_users) {
		p_users.forEach((u) => (users[u.username] = u));
		updateUserList();
	}

	function updateUser(username, active) {
		if (!users[username]) users[username] = { username: username };

		users[username].active = active;

		updateUserList();
	}

	function updateUserList() {
		const $uta = $("#usersToAdd");
		$uta.empty();

		$userList.empty();
		for (let [un, user] of Object.entries(users)) {
			if (username !== user.username)
				$userList.append(`
          <li onclick="setDirectRoom(this)" data-direct="${
						user.username
					}" class="${user.active ? "online" : "offline"}">${user.username}</li>
        `);
			// append it also to the add user list
			$uta.append(`
          <button type="button" class="list-group-item list-group-item-action" data-bs-dismiss="modal" onclick="addToChannel('${user.username}')">${user.username}</button>
        `);
		}
	}

	///////////////
	// Room List //
	///////////////
	function updateRooms(p_rooms) {
		chatRooms = p_rooms;
		updateRoomList();
	}

	function updateRoom(room) {
		chatRooms[room.id] = room;
		updateRoomList();
	}

	function removeRoom(id) {
		delete chatRooms[id];
		updateRoomList();
	}

	function updateRoomList() {
		$roomList.empty();
		chatRooms.forEach((room) => {
			if (!room.direct)
				$roomList.append(`
          <li onclick="setRoom(${room.ID})"  data-room="${room.ID}" class="${
					room.private ? "private" : "public"
				}">${room.name}</li>
        `);
		});
	}

	function updateChannels(channels) {
		const c = $("#channelJoins");

		c.empty();
		channels.forEach((r) => {
			if (!chatRooms[r.id])
				c.append(`
          <button type="button" class="list-group-item list-group-item-action" data-bs-dismiss="modal" onclick="joinChannel(${r.id})">${r.name}</button>
        `);
		});
	}

	//////////////
	// Chatting //
	//////////////

	let currentRoom = false;

	function setRoom(id) {
		let oldRoom = currentRoom;

		const room = chatRooms[id];
		currentRoom = room;

		$messages.empty();
		room.history.forEach((m) => addChatMessage(m));

		$userList.find("li").removeClass("active");
		$roomList.find("li").removeClass("active");

		if (room.direct) {
			const idx = room.members.indexOf(username) == 0 ? 1 : 0;
			const user = room.members[idx];
			setDirectRoomHeader(user);

			$userList
				.find(`li[data-direct="${user}"]`)
				.addClass("active")
				.removeClass("unread")
				.attr("data-room", room.id);
		} else {
			$("#channel-name").text("#" + room.name);
			$("#channel-description").text(
				`👤 ${room.members.length} | ${room.description}`
			);
			$roomList
				.find(`li[data-room=${room.id}]`)
				.addClass("active")
				.removeClass("unread");
		}

		$(".roomAction").css(
			"visibility",
			room.direct || room.forceMembership ? "hidden" : "visible"
		);
	}
	window.setRoom = setRoom;

	function setDirectRoomHeader(user) {
		$("#channel-name").text(user);
		$("#channel-description").text(`Direct message with ${user}`);
	}

	function setToDirectRoom(user) {
		setDirectRoomHeader(user);
		socket.emit("request_direct_room", { to: user });
	}

	window.setDirectRoom = (el) => {
		const user = el.getAttribute("data-direct");
		const room = el.getAttribute("data-room");

		if (room) {
			setRoom(parseInt(room));
		} else {
			setToDirectRoom(user);
		}
	};

	function sendMessage() {
		let message = $inputMessage.val();

		if (message && connected && currentRoom !== false) {
			$inputMessage.val("");

			const msg = {
				username: username,
				message: message,
				room: currentRoom.id,
			};

			//addChatMessage(msg);
			socket.emit("new message", msg);
		}
	}

	function addChatMessage(msg) {
		let time = new Date(msg.time).toLocaleTimeString("en-US", {
			hour12: false,
			hour: "numeric",
			minute: "numeric",
		});

		$messages.append(`
      <div class="message">
        <div class="message-avatar"></div>
        <div class="message-textual">
          <span class="message-user">${msg.username}</span>
          <span class="message-time">${time}</span>
          <span class="message-content">${msg.message}</span>
        </div>
      </div>
    `);

		$messages[0].scrollTop = $messages[0].scrollHeight;
	}

	function messageNotify(msg) {
		if (msg.direct)
			$userList.find(`li[data-direct="${msg.username}"]`).addClass("unread");
		else $roomList.find(`li[data-room=${msg.room}]`).addClass("unread");
	}

	function addChannel() {
		const name = $("#inp-channel-name").val();
		const description = $("#inp-channel-description").val();
		const private_ = $("#inp-private").is(":checked");

		socket.emit("add_channel", {
			name: name,
			description: description,
			private: private_,
		});
	}
	window.addChannel = addChannel;

	function joinChannel(id) {
		socket.emit("join_channel", { id: id });
	}
	window.joinChannel = joinChannel;

	function addToChannel(user) {
		socket.emit("add_user_to_channel", { channel: currentRoom.id, user: user });
	}
	window.addToChannel = addToChannel;

	function leaveChannel() {
		socket.emit("leave_channel", { id: currentRoom.id });
	}
	window.leaveChannel = leaveChannel;

	/////////////////////
	// Keyboard events //
	/////////////////////

	$window.on("keydown", (event) => {
		if (modalShowing) return;

		// Autofocus the current input when a key is typed
		if (!(event.ctrlKey || event.metaKey || event.altKey)) {
			$inputMessage.trigger("focus");
		}

		// When the client hits ENTER on their keyboard
		if (event.which === 13) {
			sendMessage();
		}

		// don't add newlines
		if (event.which === 13 || event.which === 10) {
			event.preventDefault();
		}
	});

	///////////////////
	// server events //
	///////////////////

	// Whenever the server emits -login-, log the login message
	socket.on("login", (data) => {
		connected = true;

		updateUsers(data.users);
		updateRooms(data.rooms);
		updateChannels(data.publicChannels);

		if (data.rooms.length > 0) {
			setRoom(data.rooms[0].id);
		}
	});

	socket.on("update_public_channels", (data) => {
		updateChannels(data.publicChannels);
	});

	// Whenever the server emits 'new message', update the chat body
	socket.on("new message", (msg) => {
		const roomId = msg.room;
		const room = chatRooms[roomId];
		if (room) {
			room.history.push(msg);
		}

		if (roomId == currentRoom.id) addChatMessage(msg);
		else messageNotify(msg);
	});

	socket.on("update_user", (data) => {
		const room = chatRooms[data.room];
		if (room) {
			room.members = data.members;

			if (room === currentRoom) setRoom(data.room);
		}
	});

	socket.on("user_state_change", (data) => {
		updateUser(data.username, data.active);
	});

	socket.on("update_room", (data) => {
		updateRoom(data.room);
		if (data.moveto) setRoom(data.room.id);
	});

	socket.on("remove_room", (data) => {
		removeRoom(data.room);
		if (currentRoom.id == data.room) setRoom(0);
	});

	////////////////
	// Connection //
	////////////////

	socket.on("connect", () => {
		/*Calls this function to connect*/
		console.log("connect");
		// ! Calls join event on the server
		socket.emit("join", { name: username, password: "chat" });
	});

	socket.on("disconnect", () => {
		console.log("disconnect");
	});

	socket.on("reconnect", () => {
		console.log("reconnect");

		// join
		// possibly to login as well?

		socket.emit("join", (username, password));
	});

	socket.on("reconnect_error", () => {
		console.log("reconnect_error");
	});
}
