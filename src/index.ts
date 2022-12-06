import axios from 'axios';
import { Workbook, Worksheet } from 'exceljs';
import * as glob from 'glob';
import { imageSize } from 'image-size';
import { parse, resolve } from 'path';

const workbook = new Workbook();

// 神奇的比例，我也不知道怎么科学验证
const PIC_COLUMN_WIDTH = 10.75, SINGLE_IMAGE_WIDTH = 75;

(async () => {
    for (const file of glob.sync('xlsx/*.xlsx')) {
        await attchImg2Xlsx(resolve(__dirname, '../', file));
    }
})();

async function attchImg2Xlsx(file: string) {
    const { ext, name } = parse(file);

    return workbook.xlsx.readFile(file)
        .then(() => {
            const list: { url: string; row: number; col: number, sheet: Worksheet, picIndex: number, urls: string[] }[] = [];

            workbook.eachSheet(sheet => {
                sheet.eachRow((row, rowNumber) => {
                    row.eachCell((cell, colNumber) => {
                        if (list.length > 10) return;

                        if (/https/g.test(cell.text)) {
                            const urls = cell.text.split('\n');

                            adjustColWidth(sheet, colNumber, urls.length);

                            urls.forEach((url, index) => {
                                list.push({
                                    url,
                                    urls,
                                    row: rowNumber - 1,
                                    col: colNumber - 1,
                                    sheet,
                                    picIndex: index,
                                });
                            });

                            cell.value = '';
                        }
                    });
                });
            });

            return list;
        })
        .then(async list => {
            console.log('Totally Images count: ', list.length);

            const errorUrls: string[] = [];

            let count = 1;

            for (const { url, urls, row, col, sheet, picIndex } of list) {
                try {
                    const { buffer, dimension } = await downloadPics(url);

                    const ratio = dimension.width! / dimension.height!;

                    const imageHeight = SINGLE_IMAGE_WIDTH / ratio;

                    const sheetRow = sheet.getRow(row + 1);

                    sheetRow.height = Math.max(imageHeight * 0.8, sheetRow.height);

                    const imageId2 = workbook.addImage({
                        buffer,
                        extension: 'jpeg',
                    });

                    sheet.addImage(imageId2, {
                        tl: { col, row, nativeCol: col, nativeColOff: picIndex * SINGLE_IMAGE_WIDTH * 10000, nativeRow: row, nativeRowOff: row - 1 },
                        ext: { width: SINGLE_IMAGE_WIDTH, height: imageHeight },
                        editAs: undefined,
                    });
                } catch (e) {
                    errorUrls.push(url);

                    const index = urls.findIndex(str => str === url);

                    index !== -1 && urls.splice(index, 1);

                    adjustColWidth(sheet, col + 1, urls.length);

                    console.error(e);
                } finally {
                    console.log(`NO.${count++} excuted`);
                }
            }

            console.log(`Done, Successfully attached ${list.length - errorUrls.length} images.`);

            errorUrls.length && console.info('Failed Urls', errorUrls);
        })
        .then(() => workbook.xlsx.writeFile(resolve(__dirname, `../dist/${name}（附图）.${ext}`)));
}

/**
 * 下载图片
 * @param url 图片url
 * @returns 返回图片的buffer数据以及图片大小
 */
async function downloadPics(url: string) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });

    const buffer = Buffer.from(response.data, 'utf-8');

    return { buffer, dimension: imageSize(buffer) };
}

/**
 * 调整列宽
 * @param sheet sheet
 * @param colNumber 列号
 * @param len 图片长度
 */
function adjustColWidth(sheet: Worksheet, colNumber: number, len: number) {
    const column = sheet.getColumn(colNumber);

    column.width = Math.max(PIC_COLUMN_WIDTH * len, column.width || 0);
}
