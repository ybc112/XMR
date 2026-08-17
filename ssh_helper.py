import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('47.239.66.133', username='root', password='Ybc20031213.')

cmd = sys.argv[1] if len(sys.argv) > 1 else 'echo no command'
stdin, stdout, stderr = client.exec_command(cmd)
out = stdout.read().decode()
err = stderr.read().decode()
print(out)
if err:
    print(f"STDERR: {err}", file=sys.stderr)
client.close()