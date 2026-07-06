# Error codes surfaced in BadRequestError responses
FOUNDATION_REQUIRED = "foundation_required"
GENERATION_FAILED = "generation_failed"


class UnauthorizedError(Exception):
    pass


class NotFoundError(Exception):
    pass


class BadRequestError(Exception):
    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        self.code = code


class DatabaseUnavailableError(Exception):
    pass


class AIServiceError(Exception):
    def __init__(self, message: str, provider: str | None = None):
        super().__init__(message)
        self.provider = provider
