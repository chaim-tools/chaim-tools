# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure
- Core schema parsing and validation
- Java code generation
- Command-line interface

### Changed
- Infrastructure improvements and refactoring

## [0.1.0] - 2024-01-XX

### Added
- Basic schema parsing from `.bprint` files
- Schema validation
- Java code generation using JavaPoet
- CLI with basic commands (validate, generate, doctor)
- Support for basic field types (string, number, bool, timestamp)
- Example schema files

### Technical Details
- Java 22 support
- Gradle build system
- JUnit 5 testing framework
- Picocli for CLI
- Jackson for JSON processing
- JavaPoet for code generation
