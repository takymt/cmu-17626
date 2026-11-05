{
  description = "Development environment for CMU 17-626 assignments";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    goalmodeling = {
      url = "github:cmu-relab/goalmodeling";
      flake = false;
    };
  };

  outputs =
    { nixpkgs, goalmodeling, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          python = pkgs.python312;
          goalmodelingPackage = python.pkgs.callPackage ./nix/goalmodeling.nix {
            src = goalmodeling;
          };
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.just
              pkgs.lefthook
              pkgs.nixfmt
              pkgs.ruff
              pkgs.shellcheck
              pkgs.zip
              (python.withPackages (ps: [
                goalmodelingPackage
                ps.mypy
              ]))
            ];
            shellHook = ''
              lefthook install
            '';
          };
        }
      );
    };
}
