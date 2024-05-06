module.exports = { hash };
const bcrypt = require("bcryptjs");

function hash(plaintext) {
	return bcrypt.hashSync(plaintext);
}
