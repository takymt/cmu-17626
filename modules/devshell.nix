{
  perSystem =
    { pkgs, self', ... }:
    {
      devShells.default = pkgs.mkShell {
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
        ];
        shellHook = ''
          lefthook install
        '';
      };
    };
}
