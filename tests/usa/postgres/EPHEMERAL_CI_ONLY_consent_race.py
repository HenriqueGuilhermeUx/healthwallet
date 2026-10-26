"""MyDataMed USA: REAL two-session PostgreSQL lock/revoke race test.

Only synthetic records in the disposable GitHub Actions Postgres service.
Runs NO migrations, connects to NO patient or Supabase database.
"""
import os
import subprocess
import time

DB = "usa_health_contract_ci"
assert os.environ.get("PGOPTIONS") == "-c app.usa_ephemeral_contract_ci=SYNTHETIC_ONLY"
assert os.environ.get("PGPASSWORD") == "synthetic_test_only"

BASE = ["psql", "-X", "-h", "localhost", "-U", "postgres", "-d", DB,
        "-At", "-v", "ON_ERROR_STOP=1"]
T = "11111111-1111-4111-8111-111111111111"
P = "22222222-2222-4222-8222-222222222222"
C = "33333333-3333-4333-8333-333333333333"
TASK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
EVENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
NOW = "2026-10-26T15:00:00Z"

def query(sql: str, timeout: int = 12) -> subprocess.CompletedProcess[str]:
    return subprocess.run(BASE + ["-c", sql], text=True,
                          capture_output=True, timeout=timeout, check=False)

def transition(revision: int, event_id: str) -> str:
    return (
        "SELECT usa_health_race_ci.transition("
        f"'{T}','{P}','{C}','{TASK}',{revision},'{event_id}','{NOW}');"
    )

# Reader enters a transaction, locks exact consent row FOR SHARE, changes
# task+audit, then holds transaction open. Concurrent revocation MUST wait.
worker = subprocess.Popen(
    BASE + ["-c", f"BEGIN; {transition(2, EVENT)} SELECT pg_sleep(6); COMMIT;"],
    text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
)
try:
    observed_sleep = False
    for _ in range(40):
        state = query(
            "SELECT count(*) FROM pg_stat_activity "
            "WHERE pid <> pg_backend_pid() "
            "AND wait_event = 'PgSleep' "
            "AND query LIKE '%usa_health_race_ci.transition%';",
        )
        if state.returncode != 0:
            raise AssertionError(state.stderr)
        if state.stdout.strip() == "1":
            observed_sleep = True
            break
        if worker.poll() is not None:
            raise AssertionError("Transaction ended before lock could be tested")
        time.sleep(0.1)
    assert observed_sleep, "Did not observe held consent lock in transaction"

    # This revocation must be blocked by the reader's shared row lock.
    conflict = query(
        "SET lock_timeout='1000ms'; UPDATE usa_health_race_ci.consent "
        "SET revoked_at='2026-10-26T14:00:00Z' "
        f"WHERE tenant_id='{T}' AND patient_id='{P}' AND clinician_id='{C}';"
    )
    assert conflict.returncode != 0, "Revocation escaped held lock"
    assert "lock timeout" in conflict.stderr, conflict.stderr

    out, err = worker.communicate(timeout=12)
    assert worker.returncode == 0, err + out
    assert "\n3\n" in "\n" + out, out

    # Once authorized transaction commits, the revoke may proceed. Any
    # attempted task mutation AFTER that revoke must fail closed.
    revoked = query(
        "UPDATE usa_health_race_ci.consent "
        "SET revoked_at='2026-10-26T14:00:00Z' "
        f"WHERE tenant_id='{T}' AND patient_id='{P}' AND clinician_id='{C}';"
    )
    assert revoked.returncode == 0 and "UPDATE 1" in revoked.stdout, (revoked.stdout, revoked.stderr)

    later = query(transition(3, OTHER))
    assert later.returncode != 0, later.stdout
    assert "clinical grant revoked or absent" in later.stderr, later.stderr

    final = query(
        "SELECT status || ':' || revision FROM usa_health_race_ci.task;"
        "SELECT count(*) FROM usa_health_race_ci.audit;"
    )
    assert final.returncode == 0, final.stderr
    lines = [x.strip() for x in final.stdout.splitlines() if x.strip()]
    assert lines == ["in_progress:3", "1"], lines
    print("PASS: real two-session consent lock, concurrent revoke wait, "
          "revocation-on-next-read and exactly one audit event")
finally:
    if worker.poll() is None:
        worker.kill()
        worker.communicate(timeout=3)
