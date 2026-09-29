/**
 * Minimal local SMTP catcher for tests. Speaks enough of SMTP for nodemailer
 * to deliver a message and keeps the raw RFC822 body in memory.
 */
import net from 'node:net'

export type CaughtMail = { raw: string }

export function startSmtpCatcher(): Promise<{
  port: number
  messages: CaughtMail[]
  stop: () => Promise<void>
}> {
  const messages: CaughtMail[] = []
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8')
    let mode: 'cmd' | 'auth-user' | 'auth-pass' | 'data' = 'cmd'
    let buffer = ''
    let data = ''
    const write = (line: string) => {
      socket.write(line)
    }

    const handleCmd = (line: string) => {
      const upper = line.toUpperCase()
      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        write('250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n')
        return
      }
      if (upper.startsWith('AUTH LOGIN')) {
        mode = 'auth-user'
        write('334 VXNlcm5hbWU6\r\n')
        return
      }
      if (upper.startsWith('AUTH ')) {
        write('235 2.7.0 Accepted\r\n')
        return
      }
      if (upper === 'DATA') {
        mode = 'data'
        data = ''
        write('354 End data with <CR><LF>.<CR><LF>\r\n')
        return
      }
      if (upper === 'QUIT') {
        write('221 Bye\r\n')
        socket.end()
        return
      }
      write('250 OK\r\n')
    }

    socket.on('data', (chunk: string) => {
      buffer += chunk
      while (buffer.length) {
        if (mode === 'data') {
          const end = buffer.indexOf('\r\n.\r\n')
          if (end === -1) {
            data += buffer
            buffer = ''
            return
          }
          data += buffer.slice(0, end)
          buffer = buffer.slice(end + 5)
          messages.push({ raw: data.replace(/^\./gm, '') })
          data = ''
          mode = 'cmd'
          write('250 OK\r\n')
          continue
        }
        const nl = buffer.indexOf('\r\n')
        if (nl === -1) return
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 2)
        if (mode === 'auth-user') {
          mode = 'auth-pass'
          write('334 UGFzc3dvcmQ6\r\n')
          continue
        }
        if (mode === 'auth-pass') {
          mode = 'cmd'
          write('235 2.7.0 Accepted\r\n')
          continue
        }
        handleCmd(line)
      }
    })

    write('220 localhost ESMTP\r\n')
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        port,
        messages,
        stop: () =>
          new Promise((done) => {
            server.close(() => done())
          }),
      })
    })
  })
}
