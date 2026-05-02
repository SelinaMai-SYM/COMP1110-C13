# What it does:
#   Delegates script execution to the package CLI entry point.
# Inputs:
#   Command-line arguments accepted by restaurant_simulation.cli.
# Outputs:
#   The same printed output produced by the CLI.

from restaurant_simulation.cli import main


if __name__ == "__main__":
    main()
