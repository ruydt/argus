# Hướng dẫn Deploy `frontend-landing` lên AWS EC2

Dưới đây là các phương pháp deploy dự án từ dễ và tự động nhất đến thủ công. 

> [!TIP]
> Dự án đã được thiết lập sẵn **Github Actions** và **Docker Compose**. Chúng mình khuyên bạn nên sử dụng **Cách 1** để tận dụng tối đa sức mạnh của tự động hóa (CI/CD).

## Chuẩn bị chung (Cho mọi cách)
1. **Khởi tạo EC2 Instance**: Tạo một máy ảo Ubuntu 22.04 / 24.04 trên AWS EC2.
2. **Mở Port (Security Group)**: Đảm bảo Security Group của EC2 đã mở các port sau với source `0.0.0.0/0`:
   - **22** (SSH)
   - **8080** (Port chạy app Docker)
   - **80** / **443** (HTTP/HTTPS - nếu cài Nginx làm reverse proxy sau này).
3. **Kết nối SSH**: Kết nối vào EC2 của bạn qua terminal:
   ```bash
   ssh -i /path/to/your-key.pem ubuntu@<IP_CỦA_EC2>
   ```

---

## Cách 1: Tự động hóa CI/CD với Github Actions (Khuyên dùng 🌟)

Với cách này, mỗi khi bạn push code lên nhánh `fea/demo-web`, Github sẽ tự động test, build Docker Image, và gửi lệnh xuống EC2 để cập nhật bản mới nhất.

### Bước 1: Cài đặt Docker trên EC2
SSH vào EC2 và chạy lệnh sau:
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ubuntu
```
*(Sau khi chạy lệnh `usermod`, bạn cần thoát SSH và đăng nhập lại để quyền có hiệu lực)*

### Bước 2: Thêm Secret vào Github Repository
Truy cập vào Repository Github > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**, sau đó thêm:
- `EC2_HOST`: IP Public của máy EC2.
- `EC2_USER`: `ubuntu` (hoặc `ec2-user` tùy theo hệ điều hành EC2).
- `EC2_SSH_KEY`: Copy toàn bộ nội dung file `.pem` (bao gồm cả dòng BEGIN và END).

### Bước 3: Push code và tận hưởng
Bạn chỉ cần commit và push code lên nhánh `fea/demo-web`. Github Actions sẽ tự động làm phần còn lại. 
Bạn có thể mở `http://<IP_CỦA_EC2>:8080` để xem thành quả.

> [!NOTE]
> **Quản lý thủ công (Nếu cần):**
> Workflow CI/CD tự động tải file `docker-compose.yml` xuống thư mục `~/frontend-landing-deploy` trên máy chủ EC2. Nếu bạn SSH vào server và muốn xem log hoặc stop app thủ công, bạn dùng lệnh:
> ```bash
> cd ~/frontend-landing-deploy
> docker compose logs -f      # Xem logs
> docker compose down         # Tắt app
> docker compose up -d        # Bật app
> ```
