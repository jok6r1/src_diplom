# Выбор сетевого интерфейса
import psutil
import socket

class NetworkInterfaceSelector:
    def __init__(self):
        self.selected_interface = None
        self.selected_interface_name = ""
        self.selected_ipv4 = ""
        self.selected_ipv6 = ""
        self.selected_mac = ""
    
    def get_network_interfaces(self):
        """Показать список интерфейсов и выбрать один по номеру"""
        interfaces = psutil.net_if_addrs()
        
        print("\nДоступные сетевые интерфейсы:")
        interfaces_list = list(interfaces.items())
        
        for index, (interface_name, addresses) in enumerate(interfaces_list, start=1):
            print(f"\n{index}. Интерфейс: {interface_name}")
            for addr in addresses:
                if addr.family == socket.AF_INET:
                    print(f"   IPv4 адрес: {addr.address}")
                elif addr.family == socket.AF_INET6:
                    print(f"   IPv6 адрес: {addr.address}")
                elif addr.family == psutil.AF_LINK:
                    print(f"   MAC-адрес: {addr.address}")
        
        while True:
            try:
                choice = int(input("\nВведите номер интерфейса для выбора (0 для отмены): "))
                if choice == 0:
                    return False
                if 1 <= choice <= len(interfaces_list):
                    self._store_selected_interface(interfaces_list[choice-1])
                    return True
                print("Некорректный номер, попробуйте еще раз")
            except ValueError:
                print("Пожалуйста, введите число")

    def _store_selected_interface(self, interface_data):
        """Сохранить данные выбранного интерфейса"""
        self.selected_interface_name, addresses = interface_data
        self.selected_interface = interface_data
        for addr in addresses:
            if addr.family == socket.AF_INET:
                self.selected_ipv4 = addr.address
            elif addr.family == socket.AF_INET6:
                self.selected_ipv6 = addr.address
            elif addr.family == psutil.AF_LINK:
                self.selected_mac = addr.address
    
    def get_selected_info(self):
        """Получить информацию о выбранном интерфейсе"""
        if not self.selected_interface:
            return None
        return {
            "interface_name": self.selected_interface_name,
            "ipv4": self.selected_ipv4,
            "ipv6": self.selected_ipv6,
            "mac": self.selected_mac
        }

    def print_selected_interface(self):
        """Напечатать информацию о выбранном интерфейсе"""
        if not self.selected_interface:
            print("Интерфейс не выбран")
            return
        print("\nВыбранный интерфейс:")
        print(f"Имя: {self.selected_interface_name}")
        print(f"IPv4: {self.selected_ipv4}")
        print(f"IPv6: {self.selected_ipv6}")
        print(f"MAC: {self.selected_mac}")

__all__ = ['NetworkInterfaceSelector']