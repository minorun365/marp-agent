from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


def test_runtime_dockerfile_copies_all_top_level_python_modules():
    dockerfile = (
        REPOSITORY_ROOT / "amplify" / "agent" / "runtime" / "Dockerfile"
    ).read_text()

    assert "COPY *.py ./" in dockerfile


def test_runtime_forwards_authorization_header_for_user_identification():
    """AgentCoreは許可リストに入れたヘッダーしかコンテナへ渡さない。

    Authorizationが落ちると、検証済みJWTから利用者を識別できず、
    エラーも出ないまま利用統計だけが取れなくなる（2026年8月に実際に発生した）。
    """
    stack_source = (REPOSITORY_ROOT / "infra" / "lib" / "agent-stack.ts").read_text()

    assert "requestHeaderAllowlist" in stack_source
    assert "'Authorization'" in stack_source


def test_runtime_role_can_publish_cloudwatch_logs_and_xray_traces():
    stack_source = (
        REPOSITORY_ROOT / "infra" / "lib" / "workload-access-stack.ts"
    ).read_text()

    required_actions = {
        "logs:DescribeLogGroups",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "xray:PutTelemetryRecords",
        "xray:PutTraceSegments",
    }

    for action in required_actions:
        assert action in stack_source
