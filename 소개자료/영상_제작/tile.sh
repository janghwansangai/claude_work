# tile.sh out.png in1 in2 in3 in4  → 2x2 contact sheet
o=$1; shift
ffmpeg -y -loglevel error -i $1 -i $2 -i $3 -i $4 -filter_complex "[0]scale=960:540[a];[1]scale=960:540[b];[2]scale=960:540[c];[3]scale=960:540[d];[a][b][c][d]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0" $o
