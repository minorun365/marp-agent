from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


def test_runtime_dockerfile_copies_all_top_level_python_modules():
    dockerfile = (
        REPOSITORY_ROOT / "amplify" / "agent" / "runtime" / "Dockerfile"
    ).read_text()

    assert "COPY *.py ./" in dockerfile


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
