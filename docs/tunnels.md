# Tunnels

Port forwarding over an existing session. Open the **Tunnels** panel from the
buttons top-right, then **New tunnel**.

All three kinds close automatically when their session ends.

## Local forward (`-L`)

**Traffic hitting a port on your PC comes out at the destination, as seen from
the server.**

Reaching a database that only listens on the server's loopback:

| Field | Value |
| --- | --- |
| Type | Local forward |
| Listen address | `127.0.0.1` |
| Listen port | `5432` |
| Destination host | `127.0.0.1` |
| Destination port | `5432` |

Now point your client at `localhost:5432` and you're talking to the server's
Postgres. The destination is resolved *by the server*, so `10.0.0.9` means
whatever the server can see at that address.

Equivalent to: `ssh -L 5432:127.0.0.1:5432 user@host`

## Remote forward (`-R`)

**The server listens on one of its own ports and hands each connection back to
your machine.**

Exposing a local dev server to something running remotely:

| Field | Value |
| --- | --- |
| Type | Remote forward |
| Forward to address | `127.0.0.1` |
| Forward to port | `3000` |
| Server bind address | `127.0.0.1` |
| Server bind port | `8080` |

Anything on the server hitting `localhost:8080` reaches your `localhost:3000`.

Equivalent to: `ssh -R 8080:127.0.0.1:3000 user@host`

> To let *other machines* reach it, the server needs `GatewayPorts yes` in its
> sshd config and a bind address of `0.0.0.0`. Without that, sshd will only bind
> loopback no matter what you ask for.

## Dynamic SOCKS5 proxy (`-D`)

**A local SOCKS5 proxy whose traffic exits from the server.**

| Field | Value |
| --- | --- |
| Type | Dynamic SOCKS5 proxy |
| Listen address | `127.0.0.1` |
| Listen port | `1080` |

Point a browser or a tool at `socks5://127.0.0.1:1080` and it browses as though
it were sitting on the server. Handy for reaching an internal network without
setting up a forward per service.

Equivalent to: `ssh -D 1080 user@host`

Supports the no-auth method and `CONNECT` with IPv4, IPv6 and hostname targets —
which is what browsers and CLI tools use. `BIND` and `UDP ASSOCIATE` are not
implemented.

## Reading the panel

Each tunnel shows its type, its route, and a live count of connections currently
open through it. The power button closes one.

## When something won't open

| Message | Cause |
| --- | --- |
| "Local port N is already in use" | Something else is on that port |
| "Server refused the remote forward" | sshd said no — usually `AllowTcpForwarding no`, or the port is taken or privileged |
