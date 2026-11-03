function trustedSender(event, window, entry) {
  return (
    !!window &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame?.url === entry
  );
}
module.exports = { trustedSender };
