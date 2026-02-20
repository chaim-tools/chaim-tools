# Contributing to Chaim CLI

Thank you for your interest in contributing to Chaim CLI! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites
- Java 22 or later
- Gradle 8.0 or later

### Building the Project
```bash
./gradlew build
```

### Running Tests
```bash
./gradlew test
```

### Building the CLI
```bash
./gradlew :cli:bootJar
```

## Project Structure

- **`schema-core/`**: Core schema parsing, validation, and models
- **`codegen-java/`**: Java code generation implementation
- **`cli/`**: Command-line interface
- **`examples/`**: Example schema files

## Code Style

- Use 2-space indentation
- Follow Java naming conventions
- Maximum line length: 120 characters
- Use meaningful variable and method names
- Add Javadoc for public APIs

## Testing

- Write unit tests for new functionality
- Ensure all tests pass before submitting
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `./gradlew test`
6. Commit your changes with a descriptive message
7. Push to your fork and submit a pull request

## Commit Message Format

Use conventional commit format:
```
type(scope): description

[optional body]

[optional footer]
```

Examples:
- `feat(cli): add new generate command`
- `fix(schema): resolve validation issue with required fields`
- `docs(readme): update installation instructions`

## Questions or Issues?

If you have questions or encounter issues:
1. Check existing issues and discussions
2. Create a new issue with a clear description
3. Join our community discussions

Thank you for contributing to Chaim CLI!
