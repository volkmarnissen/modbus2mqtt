import glob
import re
import shutil
import subprocess
import os
import sys
import tempfile
from pathlib import Path
import time
from command_utils import executeSyncCommand
defaultMimeTypes = "/etc/nginx/mime.types"
defaultLibDir = "/var/lib/nginx"
MAX_PORT_RETRIES = 60
PERMANENT_PORTS = [3002, 3006]
RESTART_PORTS = [3001, 3003, 3004, 3005, 3007]
modbus2mqtt_log_handles = []
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))

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
    print("::group::E2E cleanup")
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
    logdir = os.path.join(PROJECT_ROOT, "e2e", "servers", "logs")
    os.makedirs(logdir, exist_ok=True)

    if not restart:
        checkRequiredApps()
        with open(os.path.join(PROJECT_ROOT, "e2e", "servers", "nginx.conf", "nginx.conf"), "r") as f:
            nginxConf = f.read()
            nginxConf = re.sub(r"mime.types", nginxGetMimesTypes(), nginxConf)
        fb = tempfile.NamedTemporaryFile(delete_on_close=False)
        fb.write(nginxConf.encode("utf-8"))
        fb.close()

    with open(os.path.join(PROJECT_ROOT, "stderr.out"), "a") as outfile:
        if not restart:
            subprocess.Popen(["nohup", "nginx", "-c", fb.name, "-p", PROJECT_ROOT], stderr=outfile, stdout=outfile)
            subprocess.Popen(["nohup", "sh", "-c", os.path.join(PROJECT_ROOT, "e2e", "servers", "modbustcp")], stderr=outfile, stdout=outfile)
        if not permanent or restart:
            subprocess.Popen(["nohup", "sh", "-c", os.path.join(PROJECT_ROOT, "e2e", "servers", "mosquitto")], stderr=outfile, stdout=outfile)
            # use modbus2mqtt with different config files; log per port
            def start_modbus2mqtt(http_port: int, ingress: bool = False):
                logfile = os.path.join(logdir, f"modbus2mqtt_{http_port}.log")
                Path(logfile).parent.mkdir(parents=True, exist_ok=True)
                log_path = Path(logfile)
                if log_path.is_symlink() or log_path.exists():
                    log_path.unlink()
                log_path.touch(exist_ok=True)
                log_handle = open(logfile, "ab", buffering=0)
                modbus2mqtt_log_handles.append(log_handle)
                cmd = f"{os.path.join(PROJECT_ROOT, 'e2e', 'servers', 'modbus2mqtt')} {http_port}"
                if ingress:
                    cmd += " ingress"
                subprocess.Popen(["nohup", "sh", "-c", cmd], stdout=log_handle, stderr=log_handle)

            start_modbus2mqtt(3005)  # e2ePort
            start_modbus2mqtt(3004, ingress=True)
            start_modbus2mqtt(3007)  # mqttNoAuthPort

        # Create symlink for nginx error log into logs folder if present
        try:
            nginx_error_log = os.path.join(PROJECT_ROOT, "nginx.error.log")
            if os.path.exists(nginx_error_log):
                target = os.path.abspath(nginx_error_log)
                link_name = os.path.join(PROJECT_ROOT, "e2e", "servers", "logs", "nginx.error.log")
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
                stderr_path = os.path.join(PROJECT_ROOT, "stderr.out")
                if os.path.exists(stderr_path):
                    with open(stderr_path) as f:
                        eprint(f.read())
                error += f"Port {port} not opened!\n"
        if error != "":
            raise SyncException(error)
        else:
            eprint("All required ports are open.")

    print("::endgroup::")
    unlinkIfExist(os.path.join(PROJECT_ROOT, "stderr.out"))
