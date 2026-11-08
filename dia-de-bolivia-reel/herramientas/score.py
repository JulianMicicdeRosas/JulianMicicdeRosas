import cv2, numpy as np, sys, json, os
p=sys.argv[1]; out=sys.argv[2]
cap=cv2.VideoCapture(p); fps=cap.get(cv2.CAP_PROP_FPS) or 15
sh=[];mo=[];br=[];prev=None
while True:
    ok,f=cap.read()
    if not ok: break
    g=cv2.cvtColor(f,cv2.COLOR_BGR2GRAY)
    sh.append(cv2.Laplacian(g,cv2.CV_64F).var())
    br.append(g.mean())
    mo.append(0 if prev is None else float(np.abs(g.astype(int)-prev).mean()))
    prev=g.astype(int)
json.dump({'fps':fps,'sharp':sh,'motion':mo,'bright':br},open(out,'w'))
