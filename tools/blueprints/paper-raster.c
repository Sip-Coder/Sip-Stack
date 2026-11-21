/* Visible-surface raster for the orthographic drawings. Pixel samples are
   accumulated at three times print resolution, then filtered by the caller. */
#include <math.h>
#include <stdint.h>

void paint_paper(int width, int height, int count, const float *triangles,
                 const uint8_t *ink, uint8_t *rgba, float *depth) {
    for (int t = 0; t < count; t++) {
        const float *p = triangles + 9*t;
        const float ax = p[3]-p[0], ay = p[4]-p[1];
        const float bx = p[6]-p[0], by = p[7]-p[1];
        const float det = ax*by-bx*ay;
        if (fabsf(det)<1e-6f) continue;
        int x0 = fmaxf(0,floorf(fminf(p[0],fminf(p[3],p[6]))));
        int y0 = fmaxf(0,floorf(fminf(p[1],fminf(p[4],p[7]))));
        int x1 = fminf(width,ceilf(fmaxf(p[0],fmaxf(p[3],p[6]))));
        int y1 = fminf(height,ceilf(fmaxf(p[1],fmaxf(p[4],p[7]))));
        for (int y = y0; y < y1; y++) {
            for (int x = x0; x < x1; x++) {
                float dx = x+.5f-p[0], dy = y+.5f-p[1];
                float u = (dx*by-dy*bx)/det, v = (ax*dy-ay*dx)/det;
                if (u<0 || v<0 || u+v>1) continue;
                float z = p[2] + u*(p[5]-p[2]) + v*(p[8]-p[2]);
                int i = y*width+x;
                if (z <= depth[i]) continue;
                depth[i] = z;
                rgba[4*i] = ink[3*t];
                rgba[4*i+1] = ink[3*t+1];
                rgba[4*i+2] = ink[3*t+2];
                rgba[4*i+3] = 255;
            }
        }
    }
}
