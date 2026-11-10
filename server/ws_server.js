/**
 * CRACKUP: Protocol Eclipse
 * RFC 6455 Compliant WebSocket Server (Zero external dependencies required; works seamlessly with browser WebSocket & Node 22 WebSocket)
 */
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WebSocketClient extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.req = req;
    this.readyState = 1; // OPEN
    this.buffer = Buffer.alloc(0);
    this.id = crypto.randomUUID();
    this.isAlive = true;

    socket.setNoDelay(true);

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => {
      if (this.readyState !== 3) {
        this.readyState = 3;
        this.emit('close');
      }
    });
    socket.on('error', (err) => {
      this.emit('error', err);
    });
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) return;
        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) return;
        const bigLen = this.buffer.readBigUInt64BE(2);
        payloadLength = Number(bigLen);
        offset = 10;
      }

      const maskLength = isMasked ? 4 : 0;
      const totalFrameLength = offset + maskLength + payloadLength;
      if (this.buffer.length < totalFrameLength) return;

      let payload = this.buffer.subarray(offset + maskLength, totalFrameLength);
      if (isMasked) {
        const mask = this.buffer.subarray(offset, offset + 4);
        const unmasked = Buffer.allocUnsafe(payloadLength);
        for (let i = 0; i < payloadLength; i++) {
          unmasked[i] = payload[i] ^ mask[i & 3];
        }
        payload = unmasked;
      }

      this.buffer = this.buffer.subarray(totalFrameLength);

      if (opcode === 0x08) {
        // CLOSE frame
        this.close();
        return;
      } else if (opcode === 0x09) {
        // PING -> send PONG
        this._sendFrame(0x0a, payload);
      } else if (opcode === 0x0a) {
        // PONG
        this.isAlive = true;
      } else if (opcode === 0x01 || opcode === 0x02) {
        // TEXT or BINARY
        const text = payload.toString('utf8');
        this.emit('message', text);
      }
    }
  }

  send(data) {
    if (this.readyState !== 1) return;
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    const payload = Buffer.from(str, 'utf8');
    this._sendFrame(0x01, payload);
  }

  _sendFrame(opcode, payload) {
    if (this.readyState !== 1 || this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[0] = 0x80 | opcode;
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.allocUnsafe(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch (_) {
      // Ignore write errors on closing sockets
    }
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    try {
      const closeFrame = Buffer.from([0x88, 0x00]);
      this.socket.end(closeFrame);
    } catch (_) {
      this.socket.destroy();
    }
    this.emit('close');
  }
}

class WebSocketServer extends EventEmitter {
  constructor(httpServer) {
    super();
    this.clients = new Set();
    httpServer.on('upgrade', (req, socket, head) => {
      const key = req.headers['sec-websocket-key'];
      if (!key) {
        socket.destroy();
        return;
      }
      const acceptKey = crypto
        .createHash('sha1')
        .update(key + WS_GUID)
        .digest('base64');

      const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '\r\n'
      ];
      socket.write(headers.join('\r\n'));

      const client = new WebSocketClient(socket, req);
      if (head && head.length > 0) {
        client._onData(head);
      }
      this.clients.add(client);
      client.on('close', () => {
        this.clients.delete(client);
      });
      this.emit('connection', client, req);
    });
  }
}

module.exports = { WebSocketServer, WebSocketClient };

