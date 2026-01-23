import glob
import re
import shutil
import subprocess
import os
import sys
import tempfile
import time
from command_utils import executeSyncCommand
defaultMimeTypes = "/etc/nginx/mime.types"
defaultLibDir = "/var/lib/nginx"
MAX_PORT_RETRIES = 60
PERMANENT_PORTS = [3002, 3006]
RESTART_PORTS = [3001, 3003, 3004, 3005, 3007]

class SyncException(Exception):
    pass
def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

def isOpen(ip: str, port: int) -> bool:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.connect((ip, int(port)))
        s.shutdown(2)
        return True
    except (socket.error, ConnectionRefusedError):
        return False

def isCallable(command:str):
    try:
        executeSyncCommand(["which", command]).decode("utf-8")
    except Exception:
        raise Exception(command + " must be installed!")

def unlinkIfExist(file:str):
    if os.path.exists(file):
        os.unlink(file)

def killOne(app:str):
    try:
        executeSyncCommand(["pkill",  "-U", str(os.getuid()) ,"-f", app])
        print(f"Killed {app}")
    except Exception:
        print(f"No running process found for {app}")
        
def killRequiredApps(permanent:bool=False, restart:bool=False):
    print("::group::Cypress cleanup")
    try:
        if(not restart):
            killOne("nginx: master")
            killOne("runModbusTCP")
            unlinkIfExist("nginx.conf")
            unlinkIfExist("nginx.pid" )
            unlinkIfExist("nginx.error.log" )
        
        if(not permanent or restart):
            killOne("modbus2mqtt")
            killOne("mosquitto")
        unlinkIfExist("nohup.out" )
    finally:
        print( '::endgroup::' )
def nginxGetMimesTypes():
    if  not os.path.exists(defaultMimeTypes):
        return "/opt/homebrew/" + defaultMimeTypes
    return defaultMimeTypes
        
def nginxGetLibDir():
    if  not os.path.isdir(defaultLibDir):
         return "/opt/homebrew/var/homebrew/linked/nginx"
    return defaultLibDir
def checkRequiredApps():
    # nginx must be preinstalled
    isCallable("nginx")
    ngxinlib = nginxGetLibDir()
    if not os.path.isdir(ngxinlib) :
        raise SyncException( nginxGetLibDir() + " directory not found!") 
 
def startRequiredApps(permanent: bool, restart: bool):
    # Always avoid npm pack/init/install for e2e start; use local build instead
    try:
        shutil.rmtree("./distprod")
    except OSError:
        pass
    try:
        for f in glob.glob("modbus2mqtt-*.tgz"):
            os.remove(f)
    except OSError:
        pass

    if not permanent:
        print("::group::Build backend for local e2e server")
        try:
            # Build only the backend (server + TCP sim)
            executeSyncCommand(["npm", "run", "build:backend"]).decode("utf-8").strip()
        except Exception as err:
            eprint("npm run build:backend failed: " + str(err))
            raise SyncException("backend build failed")
        print("::endgroup::")

    print("::group::start Start required servers")

    # ensure logs directory exists
    os.makedirs("cypress/servers/logs", exist_ok=True)

    if not restart:
        checkRequiredApps()
        with open("./cypress/servers/nginx.conf/nginx.conf", "r") as f:
            nginxConf = f.read()
            nginxConf = re.sub(r"mime.types", nginxGetMimesTypes(), nginxConf)
        fb = tempfile.NamedTemporaryFile(delete_on_close=False)
        fb.write(nginxConf.encode("utf-8"))
        fb.close()

    with open("stderr.out", "a") as outfile:
        if not restart:
            subprocess.Popen(["nohup", "nginx", "-c", fb.name, "-p", "."], stderr=outfile, stdout=outfile)
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbustcp"], stderr=outfile, stdout=outfile)
        if not permanent or restart:
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/mosquitto"], stderr=outfile, stdout=outfile)
            # use modbus2mqtt with different config files
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbus2mqtt 3005"], stderr=outfile, stdout=outfile)  # e2ePort
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbus2mqtt 3004 ingress"], stderr=outfile, stdout=outfile)
            subprocess.Popen(["nohup", "sh", "-c", "./cypress/servers/modbus2mqtt 3007"], stderr=outfile, stdout=outfile)  # mqttNoAuthPort

        # Create symlink for nginx error log into logs folder if present
        try:
            if os.path.exists("nginx.error.log"):
                target = os.path.abspath("nginx.error.log")
                link_name = os.path.join("cypress", "servers", "logs", "nginx.error.log")
                if os.path.islink(link_name) or os.path.exists(link_name):
                    os.remove(link_name)
                os.symlink(target, link_name)
        except Exception:
            pass

        # Wait for required ports
        if permanent:
            ports = PERMANENT_PORTS
        elif restart:
            ports = RESTART_PORTS
        else:
            ports = PERMANENT_PORTS + RESTART_PORTS
        eprint("Waiting for " + str(ports) + " to open")
        error = ""
        for port in ports:
            count = 0
            while count < MAX_PORT_RETRIES:
                if not isOpen("localhost", port):
                    time.sleep(1)
                else:
                    break
                count += 1
            if count == MAX_PORT_RETRIES:
                if os.path.exists("stderr.out"):
                    with open("stderr.out") as f:
                        eprint(f.read())
                error += f"Port {port} not opened!\n"
        if error != "":
            raise SyncException(error)
        else:
            eprint("All required ports are open.")

    print("::endgroup::")
    unlinkIfExist("stderr.out")
