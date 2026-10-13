# FinID - Freshwater Fish Species Identifier
Static website (HTML, CSS, JavaScript) that runs an ONNX model in the browser with ONNX Runtime Web.

## Run locally
Open the folder in VS Code, install the "Live Server" extension, right-click index.html and choose "Open with Live Server".
(Double-clicking index.html will NOT work, because browsers block loading the model from a file.)

## Add the model
Put `tilapia.onnx` and `labels.json` (from Colab: /content/tilapia/export/) inside the `model/` folder.

## Real photos (optional)
Drop `nile-tilapia.jpg`, `blue-tilapia.jpg`, `blackchin-tilapia.jpg`, `redbelly-tilapia.jpg`,
`african-catfish.jpg`, `common-carp.jpg` into `images/`. The site uses them automatically; otherwise it shows the illustrations.

## Deploy
Push to a GitHub repository, then Settings > Pages > Deploy from a branch > main / (root).
