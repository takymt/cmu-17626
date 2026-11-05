{ inputs, ... }:
{
  perSystem =
    { pkgs, ... }:
    {
      packages.goalmodeling = pkgs.python312.pkgs.buildPythonPackage {
        pname = "goalmodeling";
        version = "0.1.6";
        src = inputs.goalmodeling;
        pyproject = true;

        # Upstream mixes Poetry metadata with [project.urls], which current
        # poetry-core rejects as incomplete PEP 621 metadata.
        postPatch = ''
          substituteInPlace pyproject.toml \
            --replace-fail '[project.urls]' '[tool.poetry.urls]'
        '';

        build-system = [ pkgs.python312.pkgs.poetry-core ];
        pythonImportsCheck = [ "goalmodeling.schema" ];
      };
    };
}
