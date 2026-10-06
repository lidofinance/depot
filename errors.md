`Error: contract runner does not support name resolution (operation="resolveName", code=UNSUPPORTED_OPERATION, version=6.13.1)`
Could be because of wrong address in `contracts` file (`config/lido-on-<network_name>.ts`)

`Error: connect EACCES /var/run/docker.sock`
Could be because of wrong permission at linux, fast way to fix - `sudo chmod 666 /var/run/docker.sock`
