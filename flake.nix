{
  description = "Development environment for CMU 17-626 assignments";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    goalmodeling = {
      url = "github:cmu-relab/goalmodeling";
      flake = false;
    };
  };

  outputs = { nixpkgs, goalmodeling, ... }:
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
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          python = pkgs.python312;
          goalmodelingPackage = python.pkgs.buildPythonPackage {
            pname = "goalmodeling";
            version = "0.1.6";
            src = goalmodeling;
            pyproject = true;

            # Upstream mixes Poetry metadata with a PEP 621 [project.urls] table, which current poetry-core rejects as incomplete metadata.
            postPatch = ''
              substituteInPlace pyproject.toml \
                --replace-fail '[project.urls]' '[tool.poetry.urls]'
            '';

            build-system = [ python.pkgs.poetry-core ];
            pythonImportsCheck = [ "goalmodeling.schema" ];
          };
        in
        {
          default = pkgs.mkShell {
            packages = [
              (python.withPackages (_: [ goalmodelingPackage ]))
            ];
          };
        });
    };
}
