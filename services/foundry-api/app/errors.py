class UnauthorizedError(Exception):
    pass


class NotFoundError(Exception):
    pass


class BadRequestError(Exception):
    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        self.code = code


class AIServiceError(Exception):
    def __init__(self, message: str, provider: str | None = None):
        super().__init__(message)
        self.provider = provider
