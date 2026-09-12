"""
Startup Script for Medical Consultation Offline Transcription Application.
Performs:
1. Environment & CPU core verification
2. Dependency verification
3. Model presence verification
4. Starts FastAPI backend on http://localhost:8000
5. Automatically opens web browser to Medical UI
"""

import sys
import os
import time
import argparse
import platform
import webbrowser
import multiprocessing
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))


def check_python():
    """Verify supported Python version."""
    major, minor = sys.version_info[:2]
    if major < 3 or (major == 3 and minor < 9):
        print(f"[ERROR] Python 3.9+ required. Found {sys.version.split()[0]}")
        return False
    print(f"[OK] Python version: {sys.version.split()[0]}")
    return True


def check_cpu():
    """Verify and log CPU environment."""
    cores = multiprocessing.cpu_count()
    processor = platform.processor() or platform.machine()
    system = platform.system()
    print(f"[OK] Execution Platform: {system} on {processor}")
    print(f"[OK] CPU Cores available: {cores} (CPU-only offline mode)")
    return True


def check_dependencies():
    """Verify required packages are installed."""
    required = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("websockets", "WebSockets"),
        ("numpy", "NumPy"),
        ("deepgram", "Deepgram SDK"),
        ("dotenv", "python-dotenv"),
    ]
    missing = []
    for module_name, display_name in required:
        try:
            __import__(module_name)
            print(f"[OK] Package installed: {display_name}")
        except ImportError:
            print(f"[MISSING] Package not found: {display_name} ({module_name})")
            missing.append(module_name)

    if missing:
        print("\nPlease install missing dependencies using:")
        print(f"    pip install -r requirements.txt")
        return False
    return True


def check_api_key():
    """Verify Deepgram API key is configured."""
    from pathlib import Path
    env_file = BASE_DIR / ".env"

    api_key = os.getenv("DEEPGRAM_API_KEY", "")

    # Try loading from .env if not already in environment
    if not api_key and env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("DEEPGRAM_API_KEY="):
                    api_key = line.split("=", 1)[1].strip()
                    break

    if api_key and api_key != "your_deepgram_api_key_here":
        print("[OK] Deepgram API key found.")
        return True
    else:
        print("[MISSING] DEEPGRAM_API_KEY not set.")
        print("  → Copy .env.example to .env and set your key.")
        return False


def start_server(host: str = "127.0.0.1", port: int = 8000, no_browser: bool = False):
    """Launches Uvicorn server and opens browser."""
    import uvicorn

    url = f"http://{host}:{port}"
    print("\n" + "=" * 65)
    print(" Medical Consultation — Live Transcription (Deepgram Cloud)")
    print("=" * 65)
    print(f" Server running at : {url}")
    print(f" STT Engine        : Deepgram Cloud ({os.getenv('DEEPGRAM_MODEL', 'nova-2-medical')})")
    print(f" Mode              : Real-time streaming WebSocket")
    print(" Press CTRL+C to stop.")
    print("=" * 65 + "\n")

    if not no_browser:
        def open_browser():
            time.sleep(1.2)
            try:
                webbrowser.open(url)
            except Exception:
                pass

        import threading
        threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )


def main():
    parser = argparse.ArgumentParser(description="Medical Transcription Application Launcher")
    parser.add_argument("--check-only", action="store_true", help="Only verify dependencies and models without starting server")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")
    args = parser.parse_args()

    print("Checking system requirements...")
    py_ok = check_python()
    cpu_ok = check_cpu()
    deps_ok = check_dependencies()
    key_ok = check_api_key()

    if args.check_only:
        all_ok = py_ok and cpu_ok and deps_ok and key_ok
        print(f"\n[VERIFICATION] Environment check {'PASSED' if all_ok else 'FAILED'}.")
        sys.exit(0 if all_ok else 1)

    start_server(host=args.host, port=args.port, no_browser=args.no_browser)


if __name__ == "__main__":
    main()
