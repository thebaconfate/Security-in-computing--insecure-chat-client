
# Insecure Chat Client

This is the client side of the Insecure Chat project that is mandatory for the Security in Computing course at the VUB. The course was taken during 2023-2024.

## How to use

```
$ cd insecure-chat-client
$ npm install
$ npm start
```

This launches the electron client which will try to connect to the server at `ws://localhost:3000`. Make sure that the server is started.
To modify the server connection location, change the config in public/chat.js.
