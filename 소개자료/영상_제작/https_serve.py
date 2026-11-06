import http.server, ssl, sys, functools
port, root = int(sys.argv[1]), sys.argv[2]
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
h.log_message = lambda *a: None
s = http.server.ThreadingHTTPServer(('127.0.0.1', port), h)
c = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); c.load_cert_chain('cert.pem', 'key.pem')
s.socket = c.wrap_socket(s.socket, server_side=True); s.serve_forever()
