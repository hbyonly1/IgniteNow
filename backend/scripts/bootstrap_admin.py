import argparse
from pathlib import Path
import secrets
import sys


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.database import Base, SessionLocal, engine
from backend.app.models import UserAccount
from backend.app.schema_compat import ensure_app_schema
from backend.app.services.auth_service import ADMIN_ROLE, hash_password


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create the first IgniteNow admin account.")
    parser.add_argument("--username", default="admin", help="Admin username to create when no admin exists.")
    parser.add_argument("--password", default="", help="Optional password. If omitted, a random password is generated.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    Base.metadata.create_all(bind=engine)
    ensure_app_schema(engine)
    password = args.password or secrets.token_urlsafe(18)

    with SessionLocal() as db:
        existing_admin = db.query(UserAccount).filter(UserAccount.role == ADMIN_ROLE).first()
        if existing_admin:
            print(f"Admin already exists: {existing_admin.username}")
            print("No password was changed.")
            return 0

        username = args.username.strip()
        if not username:
            print("Username is required.", file=sys.stderr)
            return 2
        if db.query(UserAccount).filter(UserAccount.username == username).first():
            print(f"Username already exists and is not admin: {username}", file=sys.stderr)
            return 2

        user = UserAccount(username=username, password_hash=hash_password(password), role=ADMIN_ROLE)
        db.add(user)
        db.commit()

    print("Created first admin account.")
    print(f"username: {username}")
    print(f"admin password: {password}")
    print("Store this password now. It will not be shown again.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
