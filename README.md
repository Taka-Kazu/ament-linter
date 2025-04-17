# ament-linter README

## Features

This extension provides linting support for ROS 2 packages using the `ament_lint` tool. It integrates with the Visual Studio Code editor to provide real-time feedback on code quality and style.

## Requirements

- ament_copyright
- ament_cppcheck
- ament_cpplint
- ament_flake8
- ament_lint_cmake
- ament_pep257
- ament_uncrustify
- ament_xmllint

(You can install them by installing `ros-DISTRO-ament-lint-common`)

## Extension Settings

Each of the ament lint tools can be configured in the settings.json file.
The default setting is to enable all tools.

```json
  "amentLinter": {
    "tools": {
      "ament_copyright": true,
      "ament_cppcheck": true,
      "ament_cpplint": true,
      "ament_flake8": true,
      "ament_lint_cmake": true,
      "ament_pep257": true,
      "ament_uncrustify": true,
      "ament_xmllint": true
     }
  }
```
You can disable a tool by setting it to `false`.

> [!NOTE]
> `ament_uncrustify` is a formatter rather than a linter. It will format the code in place.
> If you use another formatter, you may want to disable it.


## Known Issues

TBD

## Release Notes

TBD
