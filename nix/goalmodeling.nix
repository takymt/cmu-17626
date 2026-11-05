{
  buildPythonPackage,
  poetry-core,
  src,
}:

buildPythonPackage {
  pname = "goalmodeling";
  version = "0.1.6";
  inherit src;
  pyproject = true;

  # Upstream mixes Poetry metadata with [project.urls], which current
  # poetry-core rejects as incomplete PEP 621 metadata.
  postPatch = ''
    substituteInPlace pyproject.toml \
      --replace-fail '[project.urls]' '[tool.poetry.urls]'
  '';

  build-system = [ poetry-core ];
  pythonImportsCheck = [ "goalmodeling.schema" ];
}
