from PIL import Image
img = Image.open('icon-512.png')
img.resize((192, 192)).save('icon-192.png')
