{ lib, ... }:
{
  perSystem =
    {
      config,
      pkgs,
      self',
      ...
    }:
    {
      # Lets exercise modules add their own tools to the shared shell.
      options.devshell.packages = lib.mkOption {
        type = lib.types.listOf lib.types.package;
        default = [ ];
      };

      config.devShells.default = pkgs.mkShell {
        packages = [
          pkgs.just
          pkgs.lefthook
          pkgs.nixfmt
          pkgs.ruff
          pkgs.shellcheck
          pkgs.zip
          (pkgs.python312.withPackages (ps: [
            self'.packages.goalmodeling
            ps.mypy
          ]))
        ]
        ++ config.devshell.packages;
        shellHook = ''
          lefthook install
        '';
      };
    };
}
