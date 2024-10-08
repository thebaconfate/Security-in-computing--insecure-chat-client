const io = require("socket.io-client");
const electron = require("electron");
const ipcRenderer = electron.ipcRenderer;

function binarySearch(array, key, getProperty = undefined) {
	let left = 0;
	let right = array.length - 1;

	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const property = getProperty ? getProperty(array[mid]) : array[mid];
		if (property === key) {
			return array[mid];
		} else if (property < key) {
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}
	return false;
}

$(function () {
	// Get user data
	ipcRenderer.send("get-user-data");

	ipcRenderer.on("user-data", function (event, data) {
		loadPage(data);
	});
});

function loadPage(userData) {
	// Initialize variables
	const $window = $(window);
	const $messages = $(".messages"); // Messages area
	const $inputMessage = $("#input-message"); // Input message input box
	const $usernameLabel = $("#user-name");
	const $roomList = $("#room-list");
	const $userList = $("#user-list");

	let username = userData.username;
	$usernameLabel.text(username);
	let rooms;
	let users = {};
	let currentRoom;
	updateRooms(userData.rooms);
	updateUsers(userData.users);
	updateChannels(userData.publicChannels);
	if (rooms.length > 0) setRoom(rooms[0].ID);

	// Connect to server
	let connected = true;
	let modalShowing = false;

	$("#addChannelModal")
		.on("hide.bs.modal", () => {
			modalShowing = false;
		})
		.on("show.bs.modal", () => {
			modalShowing = true;
		});

	///////////////
	// User List //
	///////////////
	/**
	 * @param {Array} p_users - list of dictionaries with username and active as properties
	 * This overrides the current user list with the new list
	 */
	function updateUsers(p_users) {
		p_users.forEach((u) => (users[u.username] = u));
		updateUserList();
	}

	/**
	 * updates a user in the user list
	 * @param {string} username - the username of the user to update
	 * @param {boolean} active - the new active state of the user
	 *
	 */
	function updateUser(username, active) {
		if (!users[username]) users[username] = { username: username };

		users[username].active = active;

		updateUserList();
	}

	/**
	 * updates the user list in the UI
	 *
	 */
	function updateUserList() {
		const $uta = $("#usersToAdd");
		$uta.empty();

		$userList.empty();
		for (let [, user] of Object.entries(users)) {
			if (username !== user.username)
				$userList.append(
					`<li onclick="setDirectRoom(this)" data-direct="${
						user.username
					}" class="${user.active ? "online" : "offline"}">${
						user.username
					}</li>`
				);
			// append it also to the add user list
			$uta.append(
				`<button type="button" class="list-group-item list-group-item-action" data-bs-dismiss="modal" onclick="addToChannel('${user.username}')">${user.username}</button>`
			);
		}
	}

	///////////////
	// Room List //
	///////////////

	/**
	 *
	 * @param {Array} p_rooms - a list of rooms consisting of room.ID, room.name and room.private
	 * This overrides the current room list with the new list
	 */
	function updateRooms(p_rooms) {
		rooms = p_rooms;
		updateRoomList();
	}

	/**
	 * @param {Object} room - a room object with room.ID, room.name and room.private
	 * This updates a room in the room list given a room
	 */
	function updateRoom(room) {
		rooms = rooms.filter((r) => r.ID !== room.ID);
		rooms.push(room);
		rooms.sort((a, b) => a.ID - b.ID);
		updateRoomList();
	}

	function removeRoom(id) {
		rooms = rooms.filter((room) => room.ID !== id);
		updateRoomList();
	}
	/**
	 * updates the room list in the UI
	 */
	function updateRoomList() {
		$roomList.empty();
		rooms.forEach((room) => {
			if (!room.direct)
				$roomList.append(`
          <li onclick="setRoom(${room.ID})"  data-room="${room.ID}" class="${
					room.private ? "private" : "public"
				}">${room.name}</li>
        `);
		});
	}

	/**
	 *
	 * @param {Array[Object]} channels - a list of public channels
	 */
	function updateChannels(channels) {
		const c = $("#channelJoins");

		c.empty();
		channels.forEach((r) => {
			if (!binarySearch(rooms, r.ID, (room) => room.ID))
				c.append(`
          <button type="button" class="list-group-item list-group-item-action" data-bs-dismiss="modal" onclick="joinChannel(${r.ID})">${r.name}</button>
        `);
		});
	}

	//////////////
	// Chatting //
	//////////////
	/**
	 * @param {Number} id - the id of the room to set to.
	 */
	function setRoom(id) {
		const room = binarySearch(rooms, id, (chatRoom) => chatRoom.ID);
		ipcRenderer.send("get-room", room.ID);
	}
	window.setRoom = setRoom;

	/**
	 *
	 * @param {String} user - the username of the user to set the direct room header to
	 */
	function setDirectRoomHeader(user) {
		$("#channel-name").text(user);
		$("#channel-description").text(`Direct message with ${user}`);
	}

	/**
	 *
	 * @param {String} username - the username of the user to set the direct room to
	 */
	function setToDirectRoom(username) {
		const user = users[username];
		ipcRenderer.send("request_direct_room", { to: user.ID });
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

	/**
	 * Sends a message to the server and adds it to the UI
	 */
	function sendMessage() {
		let message = $inputMessage.val();
		if (message && connected && currentRoom !== false) {
			$inputMessage.val("");
			const msg = {
				content: message,
				room: currentRoom.ID,
			};
			ipcRenderer.send("send-message", { message: msg });
		}
	}
	/**
	 *
	 * @param {String} msg - adds a new message, called from sendMessage() and setRoom()
	 */
	function addChatMessage(msg) {
		let time = new Date(msg.timestamp).toLocaleTimeString("en-US", {
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
          <span class="message-content">${msg.content}</span>
        </div>
      </div>
    `);

		$messages[0].scrollTop = $messages[0].scrollHeight;
	}

	/**
	 *
	 * @param {Object} msg - a message object with the properties msg.username, msg.roomID and msg.direct
	 */
	function messageNotify(msg) {
		if (msg.direct)
			$userList.find(`li[data-direct="${msg.username}"]`).addClass("unread");
		else $roomList.find(`li[data-room=${msg.roomID}]`).addClass("unread");
	}

	/**
	 * Creates a new channel
	 */
	function addChannel() {
		const name = $("#inp-channel-name").val();
		const description = $("#inp-channel-description").val();
		const private_ = $("#inp-private").is(":checked");

		ipcRenderer.send("add_channel", {
			name: name,
			description: description,
			private: private_,
		});
	}

	window.addChannel = addChannel;

	/**
	 *
	 * @param {number} id - the id of the channel to join
	 */
	function joinChannel(id) {
		ipcRenderer.send("join_channel", { ID: id });
	}

	window.joinChannel = joinChannel;

	/**
	 *
	 * @param {string} user the username of the user to add to the channel
	 */
	function addToChannel(user) {
		ipcRenderer.send("add_user_to_channel", {
			channel: currentRoom.ID,
			user: user,
		});
	}
	window.addToChannel = addToChannel;

	/**
	 * Leaves the current channel
	 */
	function leaveChannel() {
		ipcRenderer.send("leave_channel", { ID: currentRoom.ID });
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

	ipcRenderer.on("new message", (event, message) => {
		if (message.roomID === currentRoom.ID) addChatMessage(message);
		else messageNotify(message);
	});

	ipcRenderer.on("update_room", (event, data) => {
		updateRoom(data.room);
		if (data.moveto) setRoom(data.room.ID);
	});

	ipcRenderer.on("update_public_channels", (event, data) => {
		updateChannels(data.publicChannels);
	});

	ipcRenderer.on("remove_room", (event, data) => {
		removeRoom(data.room);
		if (currentRoom.ID == data.room) setRoom(rooms[0].ID);
	});

	ipcRenderer.on("update_user", (event, data) => {
		const room = binarySearch(rooms, data.room, (room) => room.ID);
		if (room) {
			room.members = data.members;
			if (room.ID === currentRoom.ID) setRoom(data.room);
		}
	});

	ipcRenderer.on("user_state_change", (event, data) => {
		updateUser(data.username, data.active);
	});

	ipcRenderer.on("message-sent", (event, msg) => {
		if (!binarySearch(currentRoom.history, msg.ID, (message) => message.ID)) {
			currentRoom.history.push(msg);
			addChatMessage(msg);
		}
	});

	ipcRenderer.on("new_user", function (event, user) {
		users[user.username] = user;
		updateUserList();
	});

	ipcRenderer.on("set-room", function (event, room) {
		currentRoom = room;
		$messages.empty();
		room.history.forEach((m) => addChatMessage(m));

		$userList.find("li").removeClass("active");
		$roomList.find("li").removeClass("active");

		// chatrooms and users seem to be the merged in the same list?
		if (room.direct) {
			const idx = room.members.indexOf(username) == 0 ? 1 : 0;
			const user = room.members[idx];
			setDirectRoomHeader(user);

			$userList
				.find(`li[data-direct="${user}"]`)
				.addClass("active")
				.removeClass("unread")
				.attr("data-room", room.ID);
		} else {
			$("#channel-name").text("#" + room.name);
			$("#channel-description").text(
				`👤 ${room.members.length} | ${room.description}`
			);
			$roomList
				.find(`li[data-room=${room.ID}]`)
				.addClass("active")
				.removeClass("unread");
		}

		// this just adds CSS but figure out what this does
		$(".roomAction").css(
			"visibility",
			room.direct || room.forceMembership ? "hidden" : "visible"
		);
	});
	///////////////////
	// server events //
}
