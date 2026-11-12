{
  perSystem =
    { pkgs, ... }:
    {
      devshell.packages = [
        pkgs.biome
        pkgs.nodejs_24
        pkgs.pnpm
        pkgs.spec-kit
      ];
    };
}
